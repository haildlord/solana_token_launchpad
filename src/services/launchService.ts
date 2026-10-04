 import { type LaunchPayload, type Launch, type LaunchStatus, type ReturnLaunch, type LaunchWithStatus, type WhitelistAddress, type ReferralPayload, type Referral, type PurchasedDetails, type Tier, type VestingSchedule } from "../interfaces/index.js";
 import { type QueryResult } from "pg";
 import { AppError } from "../errors/AppError.js";
 import { HttpStatus } from "../constants/index.js";
 import {db} from "../config/db.js";

 // * insertNewLaunch : throws if unable to insert the launch
export async function insertNewLaunch(payload : LaunchPayload, userId : number) : Promise<Launch> {
    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting, imageUrl } = payload;

    let insertedLaunch : QueryResult<Launch>;
    try {
    insertedLaunch = await db.query(
        `INSERT INTO "launches" (creatorId, name, symbol, description, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, tiers, vesting, imageUrl) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
         RETURNING *`,
        [
            userId,
            name,
            symbol,
            description,
            totalSupply,
            pricePerToken,
            startsAt,
            endsAt,
            maxPerWallet,
            tiers ? JSON.stringify(tiers) : null,
            vesting ? JSON.stringify(vesting) : null,
            imageUrl ?? null
        ]
    );
    } catch (err : any) {
        if (err.code === "23505") {
            throw new AppError("A launch with this symbol already exists", HttpStatus.CONFLICT);
        }
        throw err;
    }

    if(insertedLaunch.rows[0]){
        return insertedLaunch.rows[0];
    }

    throw new AppError("Could not insert Launch", HttpStatus.INTERNAL_SERVER_ERROR);
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

export async function getLaunches(page: number = 1, limit: number = 10, status? : LaunchStatus) : Promise<ReturnLaunch>{
    
    // These conditions follow the same order as computeLaunchStatus: SOLD_OUT is checked
    // first, so a sold out launch never shows up under UPCOMING, ACTIVE or ENDED.
    let whereClause = "";

    if (status === "SOLD_OUT") {
        whereClause = "WHERE totalPurchased >= totalSupply";
    } else if (status === "UPCOMING") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt > NOW()";
    } else if (status === "ACTIVE") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt <= NOW() AND endsAt >= NOW()";
    } else if (status === "ENDED") {
        whereClause = "WHERE totalPurchased < totalSupply AND startsAt <= NOW() AND endsAt < NOW()";
    }
    
    const offset = Math.max(0, (page - 1) * limit);
    
    const query = `
        SELECT * FROM launches 
        ${whereClause} 
        ORDER BY id DESC 
        LIMIT $1 OFFSET $2
    `;
    
    const result : QueryResult<Launch> = await db.query(query, [limit, offset]);
    const countResult = await db.query(`SELECT COUNT(*) FROM launches ${whereClause}`);

    let resultWithStatus : LaunchWithStatus[] = result.rows.map((item : Launch) => (
        {
            ...item,
            status : computeLaunchStatus(item),
        }
    ))


    const total = parseInt(countResult.rows[0].count, 10);

    return { launches : resultWithStatus, total, page, limit};
}

export async function getLaunchById(id: number): Promise<LaunchWithStatus> {

    const result: QueryResult<Launch> = await db.query(
        "SELECT * FROM launches WHERE id = $1",
        [id]
    );

    const launch = result.rows[0];
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    return {
        ...launch,
        status: computeLaunchStatus(launch)
    };
}

export async function getWhitelistedAddressPerLaunchCount(launchId: number) : Promise<number>{
    const result = await db.query(`select count(*) from whitelists where launchId = $1`, [launchId]);
    return parseInt(result.rows[0].count, 10);
}

export async function insertAddress(launch_id: number, address: string[]) : Promise<{ added: number; total: number }> {

    const result : QueryResult<{address: string}> = await db.query(`INSERT INTO whitelists (launchId, address)
    SELECT $1, unnest($2::text[])
    ON CONFLICT (address, launchId) DO NOTHING
    RETURNING address;`,[
        launch_id, address
    ])

    const added = result.rowCount ?? 0;
    const total = await getWhitelistedAddressPerLaunchCount(launch_id);

    return { added, total };
}

export async function getWhitelistedAddresses(launch_id : number) : Promise<{address: string}[]> {
    
    if(!Number.isInteger(launch_id) || launch_id <= 0){
        throw new AppError("Invalid Credentials", HttpStatus.BAD_REQUEST);
    }

    const addressList = await db.query<{address: string}>(`select address from whitelists where launchId = $1`, [launch_id]);

    return addressList.rows;
}

export async function deleteAddressFromWhitelist(launch_id : number, address : string) : Promise<WhitelistAddress | undefined> {
    const result = await db.query<WhitelistAddress>(`delete from whitelists where launchId = $1 and address = $2 returning *`, [launch_id, address]);
    return result.rows[0];
}

export async function createReferralCode(
    launchId: number,
    payload: ReferralPayload
): Promise<Referral> {
    const { code, discountPercent, maxUses } = payload;
    try {
        const result = await db.query(
            `INSERT INTO referrals (launchId, code, discountPercent, maxUses, usedCount)
             VALUES ($1, $2, $3, $4, 0)
             RETURNING id, launchId, code, discountPercent, maxUses, usedCount`,
            [launchId, code, discountPercent, maxUses]
        );
        const row = result.rows[0];
        return {
            id: row.id,
            launchId: row.launchId,
            code: row.code,
            discountPercent: Number(row.discountPercent),
            maxUses: Number(row.maxUses),
            usedCount: Number(row.usedCount)
        };
    } catch (err: any) {
        if (err.code === "23505") {
            throw new AppError("Duplicate referral code for this launch", HttpStatus.CONFLICT);
        }
        throw err;
    }
}

export async function getReferralsByLaunchId(launchId: number): Promise<Referral[]> {
    const result = await db.query(
        `SELECT id, launchId, code, discountPercent, maxUses, usedCount
         FROM referrals
         WHERE launchId = $1
         ORDER BY id ASC`,
        [launchId]
    );
    return result.rows.map(row => ({
        id: row.id,
        launchId: row.launchId,
        code: row.code,
        discountPercent: Number(row.discountPercent),
        maxUses: Number(row.maxUses),
        usedCount: Number(row.usedCount)
    }));
}

export async function getPurchaseDetails(launch_id : number, tx_signature : string) : Promise<PurchasedDetails | undefined>{
    if(!launch_id || !tx_signature){
        throw new AppError("Invalid Credentials", HttpStatus.BAD_REQUEST);
    }

    const result = await db.query<PurchasedDetails>(`select * from purchases where launchId = $1 and txSignature = $2`, [launch_id, tx_signature]);
    return result.rows[0];
}

export async function getUsersAllPurchasesPerLaunch(launch_id: number, user_id: number) : Promise<PurchasedDetails[]> {
    
    if(!launch_id || !user_id || launch_id === 0 || user_id === 0){
        throw new AppError("Invalid Credentials", HttpStatus.BAD_REQUEST);
    }

    const result = await db.query<PurchasedDetails>(`select * from purchases where launchId = $1 and userId = $2 order by id asc`, [launch_id, user_id]);

    return result.rows.map(row => ({
        id: row.id,
        launchId: row.launchId,
        txSignature: row.txSignature,
        userId: row.userId,
        amount: Number(row.amount),
        walletAddress: row.walletAddress,
        totalCost: Number(row.totalCost)
    }));
}

export async function getAllPurchasesByLaunchId(launch_id: number): Promise<PurchasedDetails[]> {
    if (!launch_id || launch_id === 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const result = await db.query<PurchasedDetails>(
        `select * from purchases where launchId = $1 order by id asc`,
        [launch_id]
    );

    return result.rows.map(row => ({
        id: row.id,
        launchId: row.launchId,
        txSignature: row.txSignature,
        userId: row.userId,
        amount: Number(row.amount),
        walletAddress: row.walletAddress,
        totalCost: Number(row.totalCost)
    }));
}

export async function getSumOfUserPurchases(launch_id: number, user_id: number) : Promise<number>{
    const result = await db.query<{total: string}>(`SELECT COALESCE(SUM(amount), 0) AS total FROM purchases WHERE launchId = $1 AND userId = $2`, [launch_id, user_id]);
    return Number(result.rows[0]?.total ?? 0);
}

export async function getTiers(launch_id : number) : Promise<Tier[] | undefined> {
    if(!launch_id || launch_id === 0){
        throw new AppError("invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const result = await db.query<Tier[]>(`select tiers from launches where id = $1`, [launch_id]);
    return result.rows[0];
}

export async function recordPurchase(params: {
    launchId: number;
    userId: number;
    walletAddress: string;
    amount: number;
    totalCost: number;
    txSignature: string;
    referralCode?: string | undefined;
}): Promise<PurchasedDetails> {
    const { launchId, userId, walletAddress, amount, totalCost, txSignature, referralCode } = params;

    let result : QueryResult<PurchasedDetails>;
    try {
        result = await db.query<PurchasedDetails>(
            `INSERT INTO purchases (launchId, userId, walletAddress, amount, totalCost, txSignature)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, launchId, txSignature, userId, amount, walletAddress, totalCost`,
            [launchId, userId, walletAddress, amount, totalCost, txSignature]
        );
    } catch (err : any) {
        // txSignature is unique across the whole table, not only inside one launch
        if (err.code === "23505") {
            throw new AppError("Transaction already exists", HttpStatus.BAD_REQUEST);
        }
        throw err;
    }

    await db.query(
        `UPDATE launches SET totalPurchased = totalPurchased + $1 WHERE id = $2`,
        [amount, launchId]
    );

    if (referralCode) {
        await db.query(
            `UPDATE referrals SET usedCount = usedCount + 1 WHERE launchId = $1 AND code = $2`,
            [launchId, referralCode]
        );
    }

    const row = result.rows[0];
    if (!row) {
        throw new AppError("Failed to record purchase", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
        id: row.id,
        launchId: row.launchId,
        txSignature: row.txSignature,
        userId: row.userId,
        amount: Number(row.amount),
        walletAddress: row.walletAddress,
        totalCost: Number(row.totalCost)
    };
}

export async function getWalletPurchasedTotal(launchId: number, walletAddress: string): Promise<number> {
    const result = await db.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total 
         FROM purchases 
         WHERE launchId = $1 AND walletAddress = $2`,
        [launchId, walletAddress]
    );

    return Number(result.rows[0]?.total ?? 0);
}

export function calculateVestingSchedule(
    totalPurchased: number,
    launch: LaunchWithStatus
): VestingSchedule {

    if(!launch.vesting){
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

    if(now >= cliffEndTime){
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

export async function updateLaunch(id: number, payload: Partial<LaunchPayload>): Promise<LaunchWithStatus> {
    const existingResult = await db.query<Launch>(
        `SELECT * FROM launches WHERE id = $1`,
        [id]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const name = payload.name ?? existing.name;
    const symbol = payload.symbol ?? existing.symbol;
    const description = payload.description ?? existing.description;
    const totalSupply = payload.totalSupply !== undefined ? payload.totalSupply : existing.totalSupply;
    const pricePerToken = payload.pricePerToken !== undefined ? payload.pricePerToken : existing.pricePerToken;
    const imageUrl = payload.imageUrl !== undefined ? payload.imageUrl : (existing.imageUrl ?? null);
    const startsAt = payload.startsAt ?? existing.startsAt;
    const endsAt = payload.endsAt ?? existing.endsAt;
    const maxPerWallet = payload.maxPerWallet !== undefined ? payload.maxPerWallet : existing.maxPerWallet;
    const tiers = payload.tiers !== undefined ? (payload.tiers ? JSON.stringify(payload.tiers) : null) : (existing.tiers ? JSON.stringify(existing.tiers) : null);
    const vesting = payload.vesting !== undefined ? (payload.vesting ? JSON.stringify(payload.vesting) : null) : (existing.vesting ? JSON.stringify(existing.vesting) : null);

    if (new Date(endsAt) <= new Date(startsAt)) {
        throw new AppError("endsAt must be after startsAt", HttpStatus.BAD_REQUEST);
    }
    if (totalSupply < existing.totalPurchased) {
        throw new AppError("totalSupply cannot be less than what is already purchased", HttpStatus.BAD_REQUEST);
    }

    let result : QueryResult<Launch>;
    try {
    result = await db.query<Launch>(
        `UPDATE launches
         SET name = $1, symbol = $2, description = $3, totalSupply = $4, pricePerToken = $5,
             startsAt = $6, endsAt = $7, maxPerWallet = $8, tiers = $9, vesting = $10, imageUrl = $11
         WHERE id = $12
         RETURNING *`,
        [name, symbol, description, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, tiers, vesting, imageUrl, id]
    );
    } catch (err : any) {
        if (err.code === "23505") {
            throw new AppError("A launch with this symbol already exists", HttpStatus.CONFLICT);
        }
        throw err;
    }

    const updated = result.rows[0];
    if (!updated) {
        throw new AppError("Failed to update launch", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
        ...updated,
        status: computeLaunchStatus(updated)
    };
}

export async function setLaunchImage(id: number, imageUrl: string): Promise<LaunchWithStatus> {
    const result = await db.query<Launch>(
        `UPDATE launches SET imageUrl = $1 WHERE id = $2 RETURNING *`,
        [imageUrl, id]
    );

    const updated = result.rows[0];
    if (!updated) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    return {
        ...updated,
        status: computeLaunchStatus(updated)
    };
}
