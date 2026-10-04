import type { TokenPayload } from "./interfaces/index.js";

// Env (the DB, IMAGES and JWT_SECRET bindings) comes from worker-configuration.d.ts,
// which `npm run cf-typegen` generates from wrangler.jsonc
export type AppEnv = {
    Bindings: Env;
    Variables: {
        user: TokenPayload;
    };
};
