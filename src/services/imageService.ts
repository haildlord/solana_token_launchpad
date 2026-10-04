import { AppError } from "../errors/AppError.js";
import { HttpStatus } from "../constants/index.js";

// Workers have no disk, so instead of an uploads/ folder the image bytes go into a
// Workers KV namespace (the IMAGES binding). The database still keeps only the link,
// for example /uploads/<random id>.png, exactly like the Express version.

const MAX_BYTES = 2 * 1024 * 1024;

const allowedTypes : Record<string, string> = {
    "image/png"  : ".png",
    "image/jpeg" : ".jpg",
    "image/webp" : ".webp",
    "image/gif"  : ".gif"
};

// only keys we created ourselves are valid, anything else is simply "not found"
const KEY_PATTERN = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

export function validateImage(file : File) : void {
    if (!allowedTypes[file.type]) {
        throw new AppError("Image must be a png, jpg, webp or gif", HttpStatus.BAD_REQUEST);
    }
    if (file.size > MAX_BYTES) {
        throw new AppError("Image must be 2MB or smaller", HttpStatus.BAD_REQUEST);
    }
}

export async function saveImage(kv : KVNamespace, file : File) : Promise<string> {
    // random name, so users cannot overwrite each other's files
    const key = crypto.randomUUID() + allowedTypes[file.type];
    await kv.put(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    return `/uploads/${key}`;
}

export async function readImage(kv : KVNamespace, key : string) {
    if (!KEY_PATTERN.test(key)) return null;
    const { value, metadata } = await kv.getWithMetadata<{ contentType : string }>(key, "arrayBuffer");
    if (!value) return null;
    return { bytes: value, contentType: metadata?.contentType ?? "application/octet-stream" };
}

// Deletes an old image that this app saved. Links to other sites are left alone.
export async function removeSavedImage(kv : KVNamespace, imageUrl : string | null | undefined) : Promise<void> {
    if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
    const key = imageUrl.slice("/uploads/".length);
    if (!KEY_PATTERN.test(key)) return;
    await kv.delete(key).catch(() => {});
}
