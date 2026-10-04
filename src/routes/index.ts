import { Hono } from "hono";
import { HttpStatus } from "../constants/index.js";
import { authRoute } from "./authRoutes.js";
import { launchRoute } from "./launchRoutes.js";
import type { AppEnv } from "../types.js";

export const rootRouter = new Hono<AppEnv>();

rootRouter.get("/health", (c) => c.json({ status: "ok" }, HttpStatus.OK));
rootRouter.route("/auth", authRoute);
rootRouter.route("/launches", launchRoute);
