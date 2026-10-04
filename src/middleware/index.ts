import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";
import { getJwtSecret, verifyToken } from "../utils/jwt.js";
import { ensureSchema } from "../db/schema.js";
import type { AppEnv } from "../types.js";

// Hono calls this for anything thrown in a route, like Express's error middleware
export function errorHandler(err : Error, c : Context) {
    if (err instanceof AppError) {
        return c.json({ success: false, message: err.message }, err.statusCode as ContentfulStatusCode);
    }

    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    console.error("Unhandled Error:", err);
    return c.json({ success: false, message: "Internal Server Error" }, HttpStatus.INTERNAL_SERVER_ERROR);
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) {
        throw new AppError("Auth token missing", HttpStatus.UNAUTHORIZED);
    }

    const secret = getJwtSecret(c.env);
    try {
        c.set("user", await verifyToken(token, secret));
    } catch {
        throw new AppError("Invalid or expired token", HttpStatus.UNAUTHORIZED);
    }
    await next();
});

// makes sure the tables exist before any route touches the database
export const schemaMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    await ensureSchema(c.env.DB);
    await next();
});
