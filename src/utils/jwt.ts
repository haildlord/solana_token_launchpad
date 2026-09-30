import jwt from "jsonwebtoken";
import { type TokenPayload } from "../interfaces/index.js";

// 1. Guard against missing secret once at startup:
const JWT_SECRET = process.env.SECRET || "default_development_secret_key";

// 2. Sign tokens with expiration in one clean function:
export function generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// 3. Verify tokens for your upcoming auth middleware:
export function verifyToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}