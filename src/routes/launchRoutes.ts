import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import type { Launch, LaunchPayload, LaunchStatus, WhitelistAddress } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { insertNewLaunch, computeLaunchStatus, getLaunches, getLaunchById, insertAddress, getWhitelistedAddresses, deleteAddressFromWhitelist, createReferralCode, getReferralsByLaunchId } from "../services/launchService.js";
import { type TokenPayload, type ReturnLaunch, type LaunchWithStatus } from "../interfaces/index.js";

export const launchRoute = Router();


launchRoute.post("/", authMiddleware, async (req, res, _next) => {

    const userId : TokenPayload = (req as any).user;
    if(!userId || userId.id === 0){
        throw new AppError("Invalid Creator", HttpStatus.UNAUTHORIZED);
    }

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } : LaunchPayload = req.body;
    if(!name || !symbol || !totalSupply || !pricePerToken || !startsAt || !endsAt || !maxPerWallet || !description){
        throw new AppError("missing fields", HttpStatus.BAD_REQUEST);
    }

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
        vesting
    }

    const result : Launch  = await insertNewLaunch(payload, userId.id);

    return res.status(HttpStatus.CREATED).json({
        ...result,
        creatorId: userId.id,
        status: computeLaunchStatus(result)
    });

});

launchRoute.get("/", async(req, res) => {
    
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
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

    let { addresses } : {addresses : string[]} = req.body;
    if(!addresses || addresses.length === 0){
        throw new AppError("Address not found", HttpStatus.BAD_REQUEST);
    }

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