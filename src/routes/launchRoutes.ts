import { Hono, type Context } from "hono";
import { authMiddleware } from "../middleware/index.js";
import type { LaunchPayload, LaunchStatus, LaunchWithStatus, Referral } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { insertNewLaunch, computeLaunchStatus, getLaunches, getLaunchById, insertAddress, getWhitelistedAddresses, deleteAddressFromWhitelist, createReferralCode, getReferralsByLaunchId, getReferralByCode, isTxSignatureUsed, getSumOfUserPurchases, recordPurchase, getUsersAllPurchasesPerLaunch, getAllPurchasesByLaunchId, getWalletPurchasedTotal, calculateVestingSchedule, updateLaunch, setLaunchImage, isWalletAllowed } from "../services/launchService.js";
import { validateImage, saveImage, removeSavedImage } from "../services/imageService.js";
import { validateLaunchFields, validateAddresses, validatePurchase } from "../utils/validators.js";
import { readJson, parseLaunchId } from "../utils/body.js";
import type { AppEnv } from "../types.js";

export const launchRoute = new Hono<AppEnv>();

// loads the launch (404 if missing) and makes sure the logged in user created it (403 if not)
async function getOwnedLaunch(c : Context<AppEnv>, launch_id : number) : Promise<LaunchWithStatus> {
    const launch = await getLaunchById(c.env.DB, launch_id);
    if (c.get("user").id !== launch.creatorId) {
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }
    return launch;
}

launchRoute.post("/", authMiddleware, async (c) => {

    const user = c.get("user");
    const body = await readJson(c);

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting, imageUrl } : LaunchPayload = body;
    if (!name || !symbol || !totalSupply || !pricePerToken || !startsAt || !endsAt || !maxPerWallet || !description) {
        throw new AppError("missing fields", HttpStatus.BAD_REQUEST);
    }
    validateLaunchFields(body);

    const result = await insertNewLaunch(c.env.DB, {
        name,
        symbol,
        totalSupply,
        pricePerToken,
        startsAt,
        endsAt,
        maxPerWallet,
        description,
        tiers,
        vesting,
        imageUrl
    }, user.id);

    return c.json({
        ...result,
        creatorId: user.id,
        status: computeLaunchStatus(result)
    }, HttpStatus.CREATED);
});

launchRoute.get("/", async (c) => {

    const page = Math.max(1, parseInt(c.req.query("page") ?? "", 10) || 1);
    const limit = Math.max(1, parseInt(c.req.query("limit") ?? "", 10) || 10);
    const status = c.req.query("status") as LaunchStatus | undefined;

    const result = await getLaunches(c.env.DB, page, limit, status);
    return c.json(result, HttpStatus.OK);
});

launchRoute.get("/:id", async (c) => {
    const launch = await getLaunchById(c.env.DB, parseLaunchId(c));
    return c.json(launch, HttpStatus.OK);
});

launchRoute.put("/:id", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const body = await readJson(c);
    validateLaunchFields(body);

    const updated = await updateLaunch(c.env.DB, launch_id, body);
    return c.json(updated, HttpStatus.OK);
});

// Upload the token image. Send multipart/form-data with the file in a field called "image".
launchRoute.post("/:id/image", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    const launch = await getOwnedLaunch(c, launch_id);

    let form;
    try {
        form = await c.req.parseBody();
    } catch {
        throw new AppError("Send the image as multipart/form-data", HttpStatus.BAD_REQUEST);
    }

    const file = form["image"];
    if (!(file instanceof File)) {
        throw new AppError("Image file is required", HttpStatus.BAD_REQUEST);
    }
    validateImage(file);

    const imageUrl = await saveImage(c.env.IMAGES, file);
    const updated = await setLaunchImage(c.env.DB, launch_id, imageUrl);
    await removeSavedImage(c.env.IMAGES, launch.imageUrl);

    return c.json(updated, HttpStatus.OK);
});

launchRoute.post("/:id/whitelist", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const body = await readJson(c);

    // throws 400 unless it is a non empty array of strings
    let addresses : string[] = validateAddresses(body.addresses);

    // remvoes the duplicate address from addres
    addresses = Array.from(new Set(addresses));

    const result = await insertAddress(c.env.DB, launch_id, addresses);
    return c.json(result, HttpStatus.OK);
});

launchRoute.get("/:id/whitelist", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const result = await getWhitelistedAddresses(c.env.DB, launch_id);
    const addresses : string[] = result.map((item) => item.address);

    return c.json({
        addresses,
        total : addresses.length
    }, HttpStatus.OK);
});

launchRoute.delete("/:id/whitelist/:address", authMiddleware, async (c) => {
    const address = c.req.param("address");
    if (!address || address.trim() === "") {
        throw new AppError("Invalid address", HttpStatus.BAD_REQUEST);
    }

    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const result = await deleteAddressFromWhitelist(c.env.DB, launch_id, address);
    if (!result) {
        throw new AppError("Unable to delete", HttpStatus.NOT_FOUND);
    }

    return c.json({ removed: true }, HttpStatus.OK);
});

launchRoute.post("/:id/referrals", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const { code, discountPercent, maxUses } = await readJson(c);
    if (!code || typeof code !== "string" || code.trim() === "") {
        throw new AppError("Referral code is required", HttpStatus.BAD_REQUEST);
    }

    if (discountPercent === undefined || typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100) {
        throw new AppError("discountPercent must be a number between 0 and 100", HttpStatus.BAD_REQUEST);
    }

    if (maxUses === undefined || typeof maxUses !== "number" || maxUses <= 0 || !Number.isInteger(maxUses)) {
        throw new AppError("maxUses must be a positive integer", HttpStatus.BAD_REQUEST);
    }

    const referral = await createReferralCode(c.env.DB, launch_id, {
        code: code.trim(),
        discountPercent,
        maxUses
    });

    return c.json({
        id: referral.id,
        code: referral.code,
        discountPercent: referral.discountPercent,
        maxUses: referral.maxUses,
        usedCount: 0
    }, HttpStatus.CREATED);
});

launchRoute.get("/:id/referrals", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    await getOwnedLaunch(c, launch_id);

    const referrals = await getReferralsByLaunchId(c.env.DB, launch_id);
    return c.json(referrals, HttpStatus.OK);
});

launchRoute.post("/:id/purchase", authMiddleware, async (c) => {

    const { id: user_id } = c.get("user");
    const launch_id = parseLaunchId(c);
    const db = c.env.DB;

    // * throws error if Launch not found.
    const launch = await getLaunchById(db, launch_id);
    const launch_status : LaunchStatus = computeLaunchStatus(launch);

    if (launch_status !== "ACTIVE") {
        throw new AppError(`Launch is not active, it is ${launch_status}`, HttpStatus.BAD_REQUEST);
    }

    const body = await readJson(c);
    validatePurchase(body);
    const { walletAddress, amount, txSignature, referralCode } : { walletAddress : string, amount : number, txSignature : string, referralCode? : string } = body;

    if (!(await isWalletAllowed(db, launch_id, walletAddress))) {
        throw new AppError("Wallet not whitelisted", HttpStatus.BAD_REQUEST);
    }

    if (launch.totalPurchased + amount > launch.totalSupply) {
        throw new AppError("Exceeded the limit", HttpStatus.BAD_REQUEST);
    }

    if (await isTxSignatureUsed(db, txSignature)) {
        throw new AppError("Transaction already exists", HttpStatus.BAD_REQUEST);
    }

    let foundRefferal : Referral | null = null;

    if (referralCode) {
        foundRefferal = await getReferralByCode(db, launch_id, referralCode);
        if (!foundRefferal) {
            throw new AppError("Referral Code does not exist", HttpStatus.BAD_REQUEST);
        }

        if (foundRefferal.usedCount >= foundRefferal.maxUses) {
            throw new AppError("Referral lImit exceeded", HttpStatus.BAD_REQUEST);
        }
    }

    const totalUserPurchased = await getSumOfUserPurchases(db, launch_id, user_id);
    if (totalUserPurchased + amount > launch.maxPerWallet) {
        throw new AppError("Not Authorized", HttpStatus.BAD_REQUEST);
    }

    let totalCost = 0;
    let remaining = amount;

    // 1. Fill the tiers in order
    if (launch.tiers && launch.tiers.length > 0) {
        for (const tier of launch.tiers) {
            if (remaining <= 0) break;

            const capacity = tier.maxAmount - tier.minAmount;
            const fill = Math.min(remaining, capacity);
            totalCost += fill * tier.pricePerToken;
            remaining -= fill;
        }
    }
    // 2. Any overflow beyond tiers (or flat pricing if no tiers exist)
    if (remaining > 0) {
        totalCost += remaining * launch.pricePerToken;
    }
    // 3. Apply referral discount (if a referral was used)
    if (foundRefferal) {
        totalCost = totalCost * (1 - foundRefferal.discountPercent / 100);
    }

    const purchase = await recordPurchase(db, {
        launchId: launch_id,
        userId: user_id,
        walletAddress,
        amount,
        totalCost,
        txSignature,
        referralCode: foundRefferal?.code
    });

    return c.json(purchase, HttpStatus.CREATED);
});

launchRoute.get("/:id/purchases", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);
    const launch = await getLaunchById(c.env.DB, launch_id);

    const { id: user_id } = c.get("user");
    const isCreator = user_id === launch.creatorId;

    const purchases = isCreator
        ? await getAllPurchasesByLaunchId(c.env.DB, launch_id)
        : await getUsersAllPurchasesPerLaunch(c.env.DB, launch_id, user_id);

    return c.json({
        purchases,
        total: purchases.length
    }, HttpStatus.OK);
});

launchRoute.get("/:id/vesting", authMiddleware, async (c) => {
    const launch_id = parseLaunchId(c);

    const walletAddress = c.req.query("walletAddress");
    if (!walletAddress || walletAddress.trim() === "") {
        throw new AppError("missing walletAddress", HttpStatus.BAD_REQUEST);
    }

    const launch = await getLaunchById(c.env.DB, launch_id);

    const totalPurchased = await getWalletPurchasedTotal(c.env.DB, launch_id, walletAddress.trim());
    const schedule = calculateVestingSchedule(totalPurchased, launch);

    return c.json(schedule, HttpStatus.OK);
});
