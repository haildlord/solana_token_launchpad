import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

// Images are saved on disk in ./uploads and served from /uploads/<file name>
export const UPLOAD_DIR = path.resolve("uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowedTypes : Record<string, string> = {
    "image/png"  : ".png",
    "image/jpeg" : ".jpg",
    "image/webp" : ".webp",
    "image/gif"  : ".gif"
};

export const uploadImage = multer({
    storage : multer.diskStorage({
        destination : UPLOAD_DIR,
        filename : (_req, file, cb) => {
            // random name, so users cannot overwrite each other's files
            cb(null, crypto.randomUUID() + allowedTypes[file.mimetype]);
        }
    }),
    limits : { fileSize : 2 * 1024 * 1024 },
    fileFilter : (_req, file, cb) => {
        if (!allowedTypes[file.mimetype]) {
            return cb(new AppError("Image must be a png, jpg, webp or gif", HttpStatus.BAD_REQUEST));
        }
        cb(null, true);
    }
}).single("image");

// Deletes an old image that this server saved. Links to other sites are left alone.
export function removeSavedImage(imageUrl : string | null | undefined) : void {
    if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
    fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(imageUrl))).catch(() => {});
}
