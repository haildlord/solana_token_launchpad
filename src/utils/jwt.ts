import { sign, verify } from "hono/jwt";
import { type TokenPayload } from "../interfaces/index.js";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

// jsonwebtoken needs Node's crypto module. hono/jwt uses Web Crypto, which Workers have built in.
const SEVEN_DAYS = 7 * 24 * 60 * 60;

export function getJwtSecret(env : Env) : string {
    if (!env.JWT_SECRET) {
        throw new AppError("JWT_SECRET is not set", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return env.JWT_SECRET;
}

export function generateToken(payload : TokenPayload, secret : string) : Promise<string> {
    return sign({ ...payload, exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS }, secret, "HS256");
}

// throws if the token is broken, signed with another secret, or expired
export async function verifyToken(token : string, secret : string) : Promise<TokenPayload> {
    const payload = await verify(token, secret, "HS256");
    return { id: payload.id as number, email: payload.email as string };
}
