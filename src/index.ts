import { Hono } from "hono";
import { errorHandler, schemaMiddleware } from "./middleware/index.js";
import { rootRouter } from "./routes/index.js";
import { readImage } from "./services/imageService.js";
import { HttpStatus } from "./constants/index.js";
import type { AppEnv } from "./types.js";

// This Worker only sees /api/* and /uploads/* requests (see run_worker_first in wrangler.jsonc).
// Every other path is answered by Cloudflare straight from the built React app.
const app = new Hono<AppEnv>();

app.use("/api/*", schemaMiddleware);
app.route("/api", rootRouter);

// token images, stored in Workers KV
app.get("/uploads/:key", async (c) => {
    const image = await readImage(c.env.IMAGES, c.req.param("key"));
    if (!image) {
        return c.json({ success: false, message: "Image not found" }, HttpStatus.NOT_FOUND);
    }
    return c.body(image.bytes, HttpStatus.OK, {
        "Content-Type": image.contentType,
        // file names are random and never reused, so browsers can keep them forever
        "Cache-Control": "public, max-age=31536000, immutable"
    });
});

app.notFound((c) => c.json({ success: false, message: "Not found" }, HttpStatus.NOT_FOUND));
app.onError(errorHandler);

export default app;
