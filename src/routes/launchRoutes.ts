import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import type { Launch, LaunchPayload, LaunchStatus, WhitelistAddress, PurchasedDetails, Referral } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { insertNewLaunch, computeLaunchStatus, getLaunches, getLaunchById, insertAddress, getWhitelistedAddresses, deleteAddressFromWhitelist, createReferralCode, getReferralsByLaunchId, getPurchaseDetails, getSumOfUserPurchases, recordPurchase, getUsersAllPurchasesPerLaunch, getAllPurchasesByLaunchId, getWalletPurchasedTotal, calculateVestingSchedule, updateLaunch, setLaunchImage } from "../services/launchService.js";
import { uploadImage, removeSavedImage } from "../middleware/upload.js";
import { validateLaunchFields, validateAddresses, validatePurchase } from "../utils/validators.js";
import { type TokenPayload, type ReturnLaunch, type LaunchWithStatus } from "../interfaces/index.js";

export const launchRoute = Router();


launchRoute.post("/", authMiddleware, async (req, res, _next) => {

    const userId : TokenPayload = (req as any).user;
    if(!userId || userId.id === 0){
        throw new AppError("Invalid Creator", HttpStatus.UNAUTHORIZED);
    }

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting, imageUrl } : LaunchPayload = req.body;
    if(!name || !symbol || !totalSupply || !pricePerToken || !startsAt || !endsAt || !maxPerWallet || !description){
        throw new AppError("missing fields", HttpStatus.BAD_REQUEST);
    }
    validateLaunchFields(req.body);

    const payload = {
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
    }

    const result : Launch  = await insertNewLaunch(payload, userId.id);

    return res.status(HttpStatus.CREATED).json({
        ...result,
        creatorId: userId.id,
        status: computeLaunchStatus(result)
    });

});

launchRoute.get("/", async(req, res) => {
    
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 10);
    const status = req.query.status as LaunchStatus | undefined;

    const result : ReturnLaunch = await getLaunches(page, limit, status);

    return res.status(HttpStatus.OK).json(result);
});

launchRoute.get("/:id", async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    
    if (isNaN(id) || id <= 0) {
        throw new AppError("Invalid launch ID", HttpStatus.BAD_REQUEST);
    }

    const launch = await getLaunchById(id);
    return res.status(HttpStatus.OK).json(launch);
});

launchRoute.put("/:id", authMiddleware, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    if (isNaN(launch_id) || launch_id <= 0) {
        throw new AppError("Invalid launch ID", HttpStatus.BAD_REQUEST);
    }

    const launch: LaunchWithStatus = await getLaunchById(launch_id);
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id: user_id } = (req as any).user as TokenPayload;
    if (user_id !== launch.creatorId) {
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    validateLaunchFields(req.body);
    const updated = await updateLaunch(launch_id, req.body);
    return res.status(HttpStatus.OK).json(updated);
});

// Upload the token image. Send multipart/form-data with the file in a field called "image".
launchRoute.post("/:id/image", authMiddleware, uploadImage, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    const file = req.file;

    // the file is already saved by multer, so remove it again if we end up rejecting the request
    const reject = (message : string, status : number) : never => {
        if (file) removeSavedImage("/uploads/" + file.filename);
        throw new AppError(message, status);
    };

    if (isNaN(launch_id) || launch_id <= 0) reject("Invalid launch id", HttpStatus.BAD_REQUEST);

    let launch : LaunchWithStatus;
    try {
        launch = await getLaunchById(launch_id);
    } catch (err) {
        if (file) removeSavedImage("/uploads/" + file.filename);
        throw err;
    }

    const { id: user_id } = (req as any).user as TokenPayload;
    if (user_id !== launch.creatorId) reject("Not authorized", HttpStatus.FORBIDDEN);
    if (!file) reject("Image file is required", HttpStatus.BAD_REQUEST);

    const updated = await setLaunchImage(launch_id, "/uploads/" + file!.filename);
    removeSavedImage(launch.imageUrl);

    return res.status(HttpStatus.OK).json(updated);
});

launchRoute.post("/:id/whitelist", authMiddleware, async (req, res) => {
    
    const launch_id = parseInt((req.params.id as string), 10);
    if(!launch_id || launch_id === 0){
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }
    
    const launch : LaunchWithStatus = await getLaunchById(launch_id);
    if(!launch){
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id : creator_id } = (req as any).user as TokenPayload;
    if(creator_id !== launch.creatorId){
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    // throws 400 unless it is a non empty array of strings
    let addresses : string[] = validateAddresses(req.body.addresses);

    // remvoes the duplicate address from addres
    addresses = Array.from(new Set(addresses));

    const result : { added: number; total: number } = await insertAddress(launch_id, addresses);
    return res.status(HttpStatus.OK).json(result)
});

launchRoute.get("/:id/whitelist", authMiddleware, async (req, res) => {

    const launch_id = parseInt((req.params.id as string), 10);
    if(!launch_id || launch_id === 0){
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const launch : LaunchWithStatus = await getLaunchById(launch_id);
    if(!launch){
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id : creator_id } = (req as any).user as TokenPayload;
    if(creator_id !== launch.creatorId){
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    const result : {address: string}[] = await getWhitelistedAddresses(launch_id);
    const addresses : string[]  = result.map((item) => ( item.address ) );

    return res.status(HttpStatus.OK).json({
        addresses,
        total : addresses.length
    })
}
);

launchRoute.delete("/:id/whitelist/:address", authMiddleware, async (req, res) => {

    const address = (req.params.address as string);
    if (!address || address.trim() === "") {
        throw new AppError("Invalid address", HttpStatus.BAD_REQUEST);
    }
    
    const launch_id = parseInt((req.params.id as string), 10);
    if(!launch_id || launch_id === 0){
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const launch : LaunchWithStatus = await getLaunchById(launch_id);
    if(!launch){
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id : creator_id } = (req as any).user as TokenPayload;
    if(creator_id !== launch.creatorId){
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    const result : WhitelistAddress | undefined = await deleteAddressFromWhitelist(launch_id, address);
    if(!result){
        throw new AppError("Unable to delete", HttpStatus.NOT_FOUND);
    }

    return res.status(HttpStatus.OK).json({
        removed: true
    })
});

launchRoute.post("/:id/referrals", authMiddleware, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    if (!launch_id || launch_id <= 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const launch: LaunchWithStatus = await getLaunchById(launch_id);
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id: creator_id } = (req as any).user as TokenPayload;
    if (creator_id !== launch.creatorId) {
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    const { code, discountPercent, maxUses } = req.body;
    if (!code || typeof code !== "string" || code.trim() === "") {
        throw new AppError("Referral code is required", HttpStatus.BAD_REQUEST);
    }

    if (discountPercent === undefined || typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100) {
        throw new AppError("discountPercent must be a number between 0 and 100", HttpStatus.BAD_REQUEST);
    }

    if (maxUses === undefined || typeof maxUses !== "number" || maxUses <= 0 || !Number.isInteger(maxUses)) {
        throw new AppError("maxUses must be a positive integer", HttpStatus.BAD_REQUEST);
    }

    const referral = await createReferralCode(launch_id, {
        code: code.trim(),
        discountPercent,
        maxUses
    });

    return res.status(HttpStatus.CREATED).json({
        id: referral.id,
        code: referral.code,
        discountPercent: referral.discountPercent,
        maxUses: referral.maxUses,
        usedCount: 0
    });
});

launchRoute.get("/:id/referrals", authMiddleware, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    if (!launch_id || launch_id <= 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const launch: LaunchWithStatus = await getLaunchById(launch_id);
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id: creator_id } = (req as any).user as TokenPayload;
    if (creator_id !== launch.creatorId) {
        throw new AppError("Not authorized", HttpStatus.FORBIDDEN);
    }

    const referrals = await getReferralsByLaunchId(launch_id);
    return res.status(HttpStatus.OK).json(referrals);
});

launchRoute.post("/:id/purchase", authMiddleware, async (req, res) => {

    const { id: user_id } = (req as any).user as TokenPayload;

    if(!user_id || user_id === 0){
        throw new AppError("Invalide User", HttpStatus.BAD_REQUEST);
    }

    const launch_id : number = parseInt(req.params.id as string, 10);
    if(isNaN(launch_id) || launch_id === 0){
        throw new AppError("Launch Not Found", HttpStatus.NOT_FOUND);
    }

    // * throws error if Launch not found.
    const launch : LaunchWithStatus  = await getLaunchById(launch_id);
    const launch_status : LaunchStatus = computeLaunchStatus(launch);

    if(launch_status !== "ACTIVE"){
        throw new AppError(`Launch is not active, it is ${launch_status}`, HttpStatus.BAD_REQUEST);
    }

    validatePurchase(req.body);
    const { walletAddress, amount, txSignature, referralCode } : {walletAddress : string, amount : number, txSignature: string, referralCode : string} = req.body;

    const whitelistedAddresses : {address: string}[]  = await getWhitelistedAddresses(launch_id);
    if(whitelistedAddresses.length !== 0){

        const isWhitelisted = whitelistedAddresses.some((item) => item.address === walletAddress);
        if (!isWhitelisted) {
            throw new AppError("Wallet not whitelisted", HttpStatus.BAD_REQUEST);
        }
    }

    if(launch.totalPurchased + amount > launch.totalSupply){
        throw new AppError("Exceeded the limit", HttpStatus.BAD_REQUEST);
    }

    const purchaseDetails : PurchasedDetails | undefined = await getPurchaseDetails(launch_id, txSignature)
    if(purchaseDetails){
        throw new AppError("Transaction already exists", HttpStatus.BAD_REQUEST);
    }

    let foundRefferal : Referral | undefined = undefined;

    if(referralCode){
        const refferalList : Referral[] = await getReferralsByLaunchId(launch_id);
       foundRefferal = refferalList.find((item) => item.code === referralCode);
        if(!foundRefferal){
            throw new AppError("Referral Code does not exist", HttpStatus.BAD_REQUEST);
        }
    
        if(foundRefferal.usedCount >= foundRefferal.maxUses){
            throw new AppError("Referral lImit exceeded", HttpStatus.BAD_REQUEST);
        }
    }

    const totalUserPurchased : number = await getSumOfUserPurchases(launch_id, user_id);
    if(totalUserPurchased + amount > launch.maxPerWallet){
        throw new AppError("Not Authorized", HttpStatus.BAD_REQUEST);
    }

    let totalCost : number = 0;
    let remaining = amount;

    if(launch.tiers && launch.tiers.length > 0){
        for(const tier of launch.tiers){
            if(remaining <= 0) break;

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

    const purchase = await recordPurchase({
        launchId: launch_id,
        userId: user_id,
        walletAddress,
        amount,
        totalCost,
        txSignature,
        referralCode: foundRefferal?.code
    });

    return res.status(HttpStatus.CREATED).json(purchase);
});

launchRoute.get("/:id/purchases", authMiddleware, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    if (isNaN(launch_id) || launch_id <= 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const launch: LaunchWithStatus = await getLaunchById(launch_id);
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const { id: user_id } = (req as any).user as TokenPayload;
    const isCreator = user_id === launch.creatorId;

    const purchases = isCreator
        ? await getAllPurchasesByLaunchId(launch_id)
        : await getUsersAllPurchasesPerLaunch(launch_id, user_id);

    return res.status(HttpStatus.OK).json({
        purchases,
        total: purchases.length
    });
});

launchRoute.get("/:id/vesting", authMiddleware, async (req, res) => {
    const launch_id = parseInt(req.params.id as string, 10);
    if (isNaN(launch_id) || launch_id <= 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }

    const walletAddress = req.query.walletAddress as string;
    if (!walletAddress || walletAddress.trim() === "") {
        throw new AppError("missing walletAddress", HttpStatus.BAD_REQUEST);
    }

    const launch: LaunchWithStatus = await getLaunchById(launch_id);
    if (!launch) {
        throw new AppError("Launch not found", HttpStatus.NOT_FOUND);
    }

    const totalPurchased = await getWalletPurchasedTotal(launch_id, walletAddress.trim());
    const schedule = calculateVestingSchedule(totalPurchased, launch);

    return res.status(HttpStatus.OK).json(schedule);
});