import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, registerUser, createLaunch, uid } from "./helpers/client.js";

async function setup() {
    const owner = await registerUser("ref_owner");
    const launch = await createLaunch(owner.token);
    return { owner, launch, path: `/api/launches/${launch.id}/referrals` };
}

function codeBody(overrides = {}) {
    return { code: "CODE" + uid(), discountPercent: 10, maxUses: 5, ...overrides };
}

describe("create referral", () => {
    test("creates a code with usedCount 0", async () => {
        const { owner, path } = await setup();
        const body = codeBody({ code: "SAVE20", discountPercent: 20, maxUses: 3 });
        const res = await api("POST", path, { token: owner.token, body });

        assert.equal(res.status, 201);
        assert.ok(res.body.id);
        assert.equal(res.body.code, "SAVE20");
        assert.equal(res.body.discountPercent, 20);
        assert.equal(res.body.maxUses, 3);
        assert.equal(res.body.usedCount, 0);
    });

    test("same code twice on one launch gives 409", async () => {
        const { owner, path } = await setup();
        const body = codeBody({ code: "TWICE" });
        await api("POST", path, { token: owner.token, body });

        const res = await api("POST", path, { token: owner.token, body });
        assert.equal(res.status, 409);
    });

    test("same code on two different launches is allowed", async () => {
        const one = await setup();
        const two = await setup();
        const a = await api("POST", one.path, { token: one.owner.token, body: codeBody({ code: "SHARED" }) });
        const b = await api("POST", two.path, { token: two.owner.token, body: codeBody({ code: "SHARED" }) });
        assert.equal(a.status, 201);
        assert.equal(b.status, 201);
    });

    test("missing code gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { discountPercent: 10, maxUses: 5 } });
        assert.equal(res.status, 400);
    });

    test("missing discountPercent gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { code: "A", maxUses: 5 } });
        assert.equal(res.status, 400);
    });

    test("missing maxUses gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { code: "A", discountPercent: 10 } });
        assert.equal(res.status, 400);
    });

    test("discount above 100 gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ discountPercent: 150 }) });
        assert.equal(res.status, 400);
    });

    test("negative discount gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ discountPercent: -5 }) });
        assert.equal(res.status, 400);
    });

    test("maxUses of zero gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ maxUses: 0 }) });
        assert.equal(res.status, 400);
    });

    test("maxUses with decimals gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ maxUses: 2.5 }) });
        assert.equal(res.status, 400);
    });

    test("discount sent as a string gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ discountPercent: "10" }) });
        assert.equal(res.status, 400);
    });

    test("blank code gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: codeBody({ code: "   " }) });
        assert.equal(res.status, 400);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("POST", path, { body: codeBody() });
        assert.equal(res.status, 401);
    });

    test("non creator gets 403", async () => {
        const { path } = await setup();
        const stranger = await registerUser("stranger");
        const res = await api("POST", path, { token: stranger.token, body: codeBody() });
        assert.equal(res.status, 403);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("ref404");
        const res = await api("POST", "/api/launches/99999999/referrals", { token: user.token, body: codeBody() });
        assert.equal(res.status, 404);
    });
});

describe("list referrals", () => {
    test("shows every code with its usedCount", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: codeBody({ code: "ONE" }) });
        await api("POST", path, { token: owner.token, body: codeBody({ code: "TWO" }) });

        const res = await api("GET", path, { token: owner.token });
        assert.equal(res.status, 200);

        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        assert.equal(list.length, 2);
        const codes = list.map((r) => r.code).sort();
        assert.deepEqual(codes, ["ONE", "TWO"]);
        for (const r of list) {
            assert.equal(r.usedCount, 0);
        }
    });

    test("empty for a launch with no codes", async () => {
        const { owner, path } = await setup();
        const res = await api("GET", path, { token: owner.token });
        assert.equal(res.status, 200);
        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        assert.equal(list.length, 0);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("GET", path);
        assert.equal(res.status, 401);
    });

    test("non creator gets 403", async () => {
        const { path } = await setup();
        const stranger = await registerUser("stranger");
        const res = await api("GET", path, { token: stranger.token });
        assert.equal(res.status, 403);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("reflist404");
        const res = await api("GET", "/api/launches/99999999/referrals", { token: user.token });
        assert.equal(res.status, 404);
    });
});
