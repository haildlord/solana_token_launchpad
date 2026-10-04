import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, registerUser, createLaunch } from "./helpers/client.js";

async function setup() {
    const owner = await registerUser("wl_owner");
    const launch = await createLaunch(owner.token);
    return { owner, launch, path: `/api/launches/${launch.id}/whitelist` };
}

describe("add addresses", () => {
    test("adds new addresses and reports added and total", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, {
            token: owner.token,
            body: { addresses: ["addr1", "addr2", "addr3"] },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.added, 3);
        assert.equal(res.body.total, 3);
    });

    test("skips addresses that are already on the list", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: { addresses: ["a", "b"] } });

        const res = await api("POST", path, {
            token: owner.token,
            body: { addresses: ["b", "c"] },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.added, 1);
        assert.equal(res.body.total, 3);
    });

    test("duplicates inside the same request are only counted once", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, {
            token: owner.token,
            body: { addresses: ["same", "same", "same"] },
        });
        assert.equal(res.body.added, 1);
        assert.equal(res.body.total, 1);
    });

    test("same address on two different launches is fine", async () => {
        const one = await setup();
        const two = await setup();
        const a = await api("POST", one.path, { token: one.owner.token, body: { addresses: ["shared"] } });
        const b = await api("POST", two.path, { token: two.owner.token, body: { addresses: ["shared"] } });
        assert.equal(a.body.added, 1);
        assert.equal(b.body.added, 1);
    });

    test("empty array gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { addresses: [] } });
        assert.equal(res.status, 400);
    });

    test("missing addresses field gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: {} });
        assert.equal(res.status, 400);
    });

    test("addresses that is not an array gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { addresses: "just-a-string" } });
        assert.equal(res.status, 400);
    });

    test("array with a non-string inside gives 400", async () => {
        const { owner, path } = await setup();
        const res = await api("POST", path, { token: owner.token, body: { addresses: ["ok", 123, null] } });
        assert.equal(res.status, 400);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("POST", path, { body: { addresses: ["x"] } });
        assert.equal(res.status, 401);
    });

    test("someone who is not the creator gets 403", async () => {
        const { path } = await setup();
        const stranger = await registerUser("stranger");
        const res = await api("POST", path, { token: stranger.token, body: { addresses: ["x"] } });
        assert.equal(res.status, 403);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("wl404");
        const res = await api("POST", "/api/launches/99999999/whitelist", {
            token: user.token,
            body: { addresses: ["x"] },
        });
        assert.equal(res.status, 404);
    });
});

describe("list addresses", () => {
    test("returns what was added", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: { addresses: ["one", "two"] } });

        const res = await api("GET", path, { token: owner.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 2);
        assert.deepEqual([...res.body.addresses].sort(), ["one", "two"]);
    });

    test("empty list for a new launch", async () => {
        const { owner, path } = await setup();
        const res = await api("GET", path, { token: owner.token });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.addresses, []);
        assert.equal(res.body.total, 0);
    });

    test("non creator gets 403", async () => {
        const { path } = await setup();
        const stranger = await registerUser("stranger");
        const res = await api("GET", path, { token: stranger.token });
        assert.equal(res.status, 403);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("GET", path);
        assert.equal(res.status, 401);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("wlget404");
        const res = await api("GET", "/api/launches/99999999/whitelist", { token: user.token });
        assert.equal(res.status, 404);
    });

    test("lists of two launches do not mix", async () => {
        const one = await setup();
        const two = await setup();
        await api("POST", one.path, { token: one.owner.token, body: { addresses: ["only_in_one"] } });

        const res = await api("GET", two.path, { token: two.owner.token });
        assert.equal(res.body.total, 0);
    });
});

describe("remove address", () => {
    test("removes an address that exists", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: { addresses: ["keep", "drop"] } });

        const res = await api("DELETE", `${path}/drop`, { token: owner.token });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { removed: true });

        const list = await api("GET", path, { token: owner.token });
        assert.deepEqual(list.body.addresses, ["keep"]);
    });

    test("removing the same address twice gives 404 the second time", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: { addresses: ["once"] } });

        await api("DELETE", `${path}/once`, { token: owner.token });
        const res = await api("DELETE", `${path}/once`, { token: owner.token });
        assert.equal(res.status, 404);
    });

    test("address that was never added gives 404", async () => {
        const { owner, path } = await setup();
        const res = await api("DELETE", `${path}/never_added`, { token: owner.token });
        assert.equal(res.status, 404);
    });

    test("non creator gets 403 and the address stays", async () => {
        const { owner, path } = await setup();
        await api("POST", path, { token: owner.token, body: { addresses: ["safe"] } });
        const stranger = await registerUser("stranger");

        const res = await api("DELETE", `${path}/safe`, { token: stranger.token });
        assert.equal(res.status, 403);

        const list = await api("GET", path, { token: owner.token });
        assert.deepEqual(list.body.addresses, ["safe"]);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("DELETE", `${path}/anything`);
        assert.equal(res.status, 401);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("wldel404");
        const res = await api("DELETE", "/api/launches/99999999/whitelist/x", { token: user.token });
        assert.equal(res.status, 404);
    });
});
