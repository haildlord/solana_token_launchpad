import { type LaunchPayload, type Launch, type LaunchStatus, type ReturnLaunch, type LaunchWithStatus, type WhitelistAddress, type ReferralPayload, type Referral, type PurchasedDetails, type VestingSchedule } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

// D1 keeps tiers and vesting as JSON text, so rows need a small conversion on the way out
type LaunchRow = Omit<Launch, "tiers" | "vesting"> & { tiers : string | null, vesting : string | null };

function toLaunch(row : LaunchRow) : Launch {
    return {
        ...row,
        tiers   : row.tiers ? JSON.parse(row.tiers) : null,
        vesting : row.vesting ? JSON.parse(row.vesting) : null
    };
}

function withStatus(row : LaunchRow) : LaunchWithStatus {
    const launch = toLaunch(row);
    return { ...launch, status: computeLaunchStatus(launch) };
}

// dates are stored as ISO strings in UTC so they can be compared as text in SQL
function toIso(value : string | Date) : string {
    return new Date(value).toISOString();
}

function isUniqueError(err : unknown) : boolean {
    return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

 // * insertNewLaunch : throws if unable to insert the launch
export async function insertNewLaunch(db : D1Database, payload : LaunchPayload, userId : number) : Promise<Launch> {
    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting, imageUrl } = payload;

    let row : LaunchRow | null;
    try {
        row = await db.prepare(
            `INSERT INTO launches (creatorId, name, symbol, description, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, tiers, vesting, imageUrl)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING *`
        ).bind(
            userId,
            name,
            symbol,
            description,
            totalSupply,
            pricePerToken,
            toIso(startsAt),
            toIso(endsAt),
            maxPerWallet,
            tiers ? JSON.stringify(tiers) : null,
            vesting ? JSON.stringify(vesting) : null,
            imageUrl ?? null
        ).first<LaunchRow>();
    } catch (err) {
        if (isUniqueError(err)) {
            throw new AppError("A launch with this symbol already exists", HttpStatus.CONFLICT);
        }
        throw err;
    }

    if (!row) {
        throw new AppError("Could not insert Launch", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return toLaunch(row);
}

export function computeLaunchStatus(launch : {
    startsAt    : Date | string;
    endsAt      : Date | string;
    totalSupply : number;
    totalPurchased : number
}) : LaunchStatus {

    const now   = new Date();
    const start = new Date(launch.startsAt);
    const end   = new Date(launch.endsAt);

    const purchased = launch.totalPurchased;
    const total     = launch.totalSupply;

    if (purchased >= total && total > 0) {
        return "SOLD_OUT";
    }

    if (now < start) {
        return "UPCOMING";
    }

    if (now > end) {
        return "ENDED";
    }

    return "ACTIVE";
}

export async function getLaunches(db : D1Database, page : number = 1, limit : number = 10, status? : LaunchStatus) : Promise<ReturnLaunch> {

    // These conditions follow the same order as computeLaunchStatus: SOLD_OUT is checked
    // first, so a sold out launch never shows up under UPCOMING, ACTIVE or ENDED.
    // Postgres had NOW(), here we pass the current time in as a parameter.
    const now = new Date().toISOString();
    let whereClause = "";
    let params : unknown[] = [];

    if (status === "SOLD_OUT") {
        whereClause = "WHERE totalPurchased >= totalSupply";
    } else if (status === "UPCOMING") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt > ?";
        params = [now];
    } else if (status === "ACTIVE") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt <= ? AND endsAt >= ?";
        params = [now, now];
    } else if (status === "ENDED") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt <= ? AND endsAt < ?";
        params = [now, now];
    }

    const offset = Math.max(0, (page - 1) * limit);

    // batch sends both queries in one round trip
    const [list, count] = await db.batch([
        db.prepare(`SELECT * FROM launches ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset),
        db.prepare(`SELECT COUNT(*) AS count FROM launches ${whereClause}`).bind(...params)
    ]);

    const launches = (list!.results as LaunchRow[]).map(withStatus);
    const total = Number((count!.results[0] as { count : number }).count);

    return { launches, total, page, limit };
}

export async function getLaunchById(db : D1Database, id : number) : Promise<LaunchWithStatus> {
    const row = await db.prepare(`SELECT * FROM launches WHERE id = ?`).bind(id).first<LaunchRow>();
    if (!row) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }
    return withStatus(row);
}

export async function getWhitelistedAddressPerLaunchCount(db : D1Database, launchId : number) : Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM whitelists WHERE launchId = ?`).bind(launchId).first<{ count : number }>();
    return Number(row?.count ?? 0);
}

export async function insertAddress(db : D1Database, launch_id : number, addresses : string[]) : Promise<{ added : number; total : number }> {

    // Postgres had unnest() to insert an array in one go. SQLite does not, so we build
    // "VALUES (?, ?), (?, ?), ..." ourselves. D1 allows 100 parameters per query,
    // which is 50 addresses, so bigger lists are split into groups of 50.
    const statements : D1PreparedStatement[] = [];
    for (let i = 0; i < addresses.length; i += 50) {
        const group = addresses.slice(i, i + 50);
        const values = group.map(() => "(?, ?)").join(", ");
        statements.push(
            db.prepare(`INSERT OR IGNORE INTO whitelists (launchId, address) VALUES ${values}`)
              .bind(...group.flatMap((address) => [launch_id, address]))
        );
    }

    const results = await db.batch(statements);
    const added = results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0);
    const total = await getWhitelistedAddressPerLaunchCount(db, launch_id);

    return { added, total };
}

export async function getWhitelistedAddresses(db : D1Database, launch_id : number) : Promise<{ address : string }[]> {
    const { results } = await db.prepare(`SELECT address FROM whitelists WHERE launchId = ? ORDER BY id ASC`).bind(launch_id).all<{ address : string }>();
    return results;
}

// true when the whitelist is empty (anyone can buy) or the wallet is on it
export async function isWalletAllowed(db : D1Database, launch_id : number, walletAddress : string) : Promise<boolean> {
    const row = await db.prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(address = ?), 0) AS matched FROM whitelists WHERE launchId = ?`
    ).bind(walletAddress, launch_id).first<{ total : number, matched : number }>();
    return !row || row.total === 0 || row.matched > 0;
}

export async function deleteAddressFromWhitelist(db : D1Database, launch_id : number, address : string) : Promise<WhitelistAddress | null> {
    return db.prepare(`DELETE FROM whitelists WHERE launchId = ? AND address = ? RETURNING *`).bind(launch_id, address).first<WhitelistAddress>();
}

export async function createReferralCode(db : D1Database, launchId : number, payload : ReferralPayload) : Promise<Referral> {
    const { code, discountPercent, maxUses } = payload;
    try {
        const row = await db.prepare(
            `INSERT INTO referrals (launchId, code, discountPercent, maxUses, usedCount)
             VALUES (?, ?, ?, ?, 0)
             RETURNING id, launchId, code, discountPercent, maxUses, usedCount`
        ).bind(launchId, code, discountPercent, maxUses).first<Referral>();

        if (!row) {
            throw new AppError("Could not create referral code", HttpStatus.INTERNAL_SERVER_ERROR);
        }
        return row;
    } catch (err) {
        if (isUniqueError(err)) {
            throw new AppError("Duplicate referral code for this launch", HttpStatus.CONFLICT);
        }
        throw err;
    }
}

export async function getReferralsByLaunchId(db : D1Database, launchId : number) : Promise<Referral[]> {
    const { results } = await db.prepare(
        `SELECT id, launchId, code, discountPercent, maxUses, usedCount
         FROM referrals
         WHERE launchId = ?
         ORDER BY id ASC`
    ).bind(launchId).all<Referral>();
    return results;
}

export async function getReferralByCode(db : D1Database, launchId : number, code : string) : Promise<Referral | null> {
    return db.prepare(
        `SELECT id, launchId, code, discountPercent, maxUses, usedCount FROM referrals WHERE launchId = ? AND code = ?`
    ).bind(launchId, code).first<Referral>();
}

// txSignature is unique across the whole table, not only inside one launch
export async function isTxSignatureUsed(db : D1Database, tx_signature : string) : Promise<boolean> {
    const row = await db.prepare(`SELECT id FROM purchases WHERE txSignature = ?`).bind(tx_signature).first();
    return row !== null;
}

const PURCHASE_COLUMNS = "id, launchId, txSignature, userId, amount, walletAddress, totalCost";

export async function getUsersAllPurchasesPerLaunch(db : D1Database, launch_id : number, user_id : number) : Promise<PurchasedDetails[]> {
    const { results } = await db.prepare(
        `SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE launchId = ? AND userId = ? ORDER BY id ASC`
    ).bind(launch_id, user_id).all<PurchasedDetails>();
    return results;
}

export async function getAllPurchasesByLaunchId(db : D1Database, launch_id : number) : Promise<PurchasedDetails[]> {
    const { results } = await db.prepare(
        `SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE launchId = ? ORDER BY id ASC`
    ).bind(launch_id).all<PurchasedDetails>();
    return results;
}

export async function getSumOfUserPurchases(db : D1Database, launch_id : number, user_id : number) : Promise<number> {
    const row = await db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE launchId = ? AND userId = ?`
    ).bind(launch_id, user_id).first<{ total : number }>();
    return Number(row?.total ?? 0);
}

export async function recordPurchase(db : D1Database, params : {
    launchId : number;
    userId : number;
    walletAddress : string;
    amount : number;
    totalCost : number;
    txSignature : string;
    referralCode? : string | undefined;
}) : Promise<PurchasedDetails> {
    const { launchId, userId, walletAddress, amount, totalCost, txSignature, referralCode } = params;

    const statements = [
        db.prepare(
            `INSERT INTO purchases (launchId, userId, walletAddress, amount, totalCost, txSignature)
             VALUES (?, ?, ?, ?, ?, ?)
             RETURNING ${PURCHASE_COLUMNS}`
        ).bind(launchId, userId, walletAddress, amount, totalCost, txSignature),
        db.prepare(`UPDATE launches SET totalPurchased = totalPurchased + ? WHERE id = ?`).bind(amount, launchId)
    ];

    if (referralCode) {
        statements.push(
            db.prepare(`UPDATE referrals SET usedCount = usedCount + 1 WHERE launchId = ? AND code = ?`).bind(launchId, referralCode)
        );
    }

    // A batch runs as one transaction: if the insert fails, the updates are rolled back too.
    // (The Express version ran these as three separate queries.)
    let inserted;
    try {
        [inserted] = await db.batch<PurchasedDetails>(statements);
    } catch (err) {
        if (isUniqueError(err)) {
            throw new AppError("Transaction already exists", HttpStatus.BAD_REQUEST);
        }
        throw err;
    }

    const row = inserted?.results[0];
    if (!row) {
        throw new AppError("Failed to record purchase", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return row;
}

export async function getWalletPurchasedTotal(db : D1Database, launchId : number, walletAddress : string) : Promise<number> {
    const row = await db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE launchId = ? AND walletAddress = ?`
    ).bind(launchId, walletAddress).first<{ total : number }>();
    return Number(row?.total ?? 0);
}

export function calculateVestingSchedule(
    totalPurchased : number,
    launch : LaunchWithStatus
) : VestingSchedule {

    if (!launch.vesting) {
        return {
            totalPurchased,
            tgeAmount : totalPurchased,
            cliffEndsAt : null,
            vestedAmount : totalPurchased,
            lockedAmount : 0,
            claimableAmount : totalPurchased
        }
    }

    const { cliffDays, vestingDays, tgePercent } = launch.vesting;

    const tgeAmount = Math.floor(totalPurchased * tgePercent / 100);

    const launchEndTime = new Date(launch.endsAt).getTime();
    const cliffEndTime = launchEndTime + cliffDays * 86400 * 1000;
    const cliffEndsAt = new Date(cliffEndTime);

    const now = Date.now();
    let linearVested = 0;

    if (now >= cliffEndTime) {
        const vestingDurationMs = vestingDays * 86400 * 1000;
        const timeSinceCliff = now - cliffEndTime;
        const remainingTokens = totalPurchased - tgeAmount;

        if (vestingDurationMs <= 0 || timeSinceCliff >= vestingDurationMs) {
            linearVested = remainingTokens;
        } else {
            linearVested = (remainingTokens * timeSinceCliff) / vestingDurationMs;
        }
    }

    const vestedAmount = tgeAmount + linearVested;
    const lockedAmount = Math.max(0, totalPurchased - vestedAmount);
    const claimableAmount = vestedAmount;

    return {
        totalPurchased,
        tgeAmount,
        cliffEndsAt,
        vestedAmount,
        lockedAmount,
        claimableAmount
    };
}

export async function updateLaunch(db : D1Database, id : number, payload : Partial<LaunchPayload>) : Promise<LaunchWithStatus> {
    const existingRow = await db.prepare(`SELECT * FROM launches WHERE id = ?`).bind(id).first<LaunchRow>();
    if (!existingRow) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }
    const existing = toLaunch(existingRow);

    const name = payload.name ?? existing.name;
    const symbol = payload.symbol ?? existing.symbol;
    const description = payload.description ?? existing.description;
    const totalSupply = payload.totalSupply !== undefined ? payload.totalSupply : existing.totalSupply;
    const pricePerToken = payload.pricePerToken !== undefined ? payload.pricePerToken : existing.pricePerToken;
    const imageUrl = payload.imageUrl !== undefined ? payload.imageUrl : (existing.imageUrl ?? null);
    const startsAt = toIso(payload.startsAt ?? existing.startsAt);
    const endsAt = toIso(payload.endsAt ?? existing.endsAt);
    const maxPerWallet = payload.maxPerWallet !== undefined ? payload.maxPerWallet : existing.maxPerWallet;
    const tiers = payload.tiers !== undefined ? payload.tiers : existing.tiers;
    const vesting = payload.vesting !== undefined ? payload.vesting : existing.vesting;

    if (new Date(endsAt) <= new Date(startsAt)) {
        throw new AppError("endsAt must be after startsAt", HttpStatus.BAD_REQUEST);
    }
    if (totalSupply < existing.totalPurchased) {
        throw new AppError("totalSupply cannot be less than what is already purchased", HttpStatus.BAD_REQUEST);
    }

    let updated : LaunchRow | null;
    try {
        updated = await db.prepare(
            `UPDATE launches
             SET name = ?, symbol = ?, description = ?, totalSupply = ?, pricePerToken = ?,
                 startsAt = ?, endsAt = ?, maxPerWallet = ?, tiers = ?, vesting = ?, imageUrl = ?
             WHERE id = ?
             RETURNING *`
        ).bind(
            name, symbol, description, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet,
            tiers ? JSON.stringify(tiers) : null,
            vesting ? JSON.stringify(vesting) : null,
            imageUrl,
            id
        ).first<LaunchRow>();
    } catch (err) {
        if (isUniqueError(err)) {
            throw new AppError("A launch with this symbol already exists", HttpStatus.CONFLICT);
        }
        throw err;
    }

    if (!updated) {
        throw new AppError("Failed to update launch", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return withStatus(updated);
}

export async function setLaunchImage(db : D1Database, id : number, imageUrl : string) : Promise<LaunchWithStatus> {
    const updated = await db.prepare(`UPDATE launches SET imageUrl = ? WHERE id = ? RETURNING *`).bind(imageUrl, id).first<LaunchRow>();
    if (!updated) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }
    return withStatus(updated);
}
