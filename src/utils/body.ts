import type { Context } from "hono";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

// Express gave us req.body from express.json(). In Hono we read it ourselves.
// No body means an empty object, and broken JSON is a 400 instead of a 500.
export async function readJson(c : Context) : Promise<any> {
    const text = await c.req.text();
    if (!text.trim()) return {};
    try {
        const parsed = JSON.parse(text);
        return parsed !== null && typeof parsed === "object" ? parsed : {};
    } catch {
        throw new AppError("Invalid JSON body", HttpStatus.BAD_REQUEST);
    }
}

export function parseLaunchId(c : Context) : number {
    const id = parseInt(c.req.param("id") ?? "", 10);
    if (isNaN(id) || id <= 0) {
        throw new AppError("Invalid launch id", HttpStatus.BAD_REQUEST);
    }
    return id;
}
