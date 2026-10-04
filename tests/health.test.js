import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "./helpers/client.js";

test("GET /api/health returns ok", async () => {
    const res = await api("GET", "/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
});

test("health check does not need a token", async () => {
    const res = await api("GET", "/api/health", { token: "not-a-real-token" });
    assert.equal(res.status, 200);
});

test("unknown route does not return 200", async () => {
    const res = await api("GET", "/api/does-not-exist");
    assert.equal(res.status, 404);
});
