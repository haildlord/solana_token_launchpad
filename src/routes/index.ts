import {Router, type NextFunction, type Request, type Response} from "express";
import { HttpStatus } from "../constants/index.js";
import { authRoute } from "./authRoutes.js";
import {launchRoute} from "./launchRoutes.js";

export const rootRouter = Router();

function getHealth(_req : Request, res : Response, _next: NextFunction) {
    return res.status(HttpStatus.OK).json({
        status: "ok" 
    });    
}

rootRouter.get("/health", getHealth);
rootRouter.use("/auth", authRoute);
rootRouter.use("/launches", launchRoute);