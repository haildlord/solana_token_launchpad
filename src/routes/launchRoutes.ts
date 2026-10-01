import { Router } from "express";
import { authMiddleware } from "../middleware/index.js";
import type { Launch, LaunchPayload, LaunchStatus } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { insertNewLaunch, computeLaunchStatus, getLaunches, getLaunchById } from "../services/launchService.js";
import { type TokenPayload, type ReturnLaunch } from "../interfaces/index.js";

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