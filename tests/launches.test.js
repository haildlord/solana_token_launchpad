import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, registerUser, createLaunch, launchBody, daysFromNow, buy } from "./helpers/client.js";

describe("create launch", () => {
    test("creates a launch and returns it with id, creatorId and status", async () => {
        const user = await registerUser("creator");
        const payload = launchBody();
        const res = await api("POST", "/api/launches", { token: user.token, body: payload });

        assert.equal(res.status, 201);
        assert.ok(res.body.id);
        assert.equal(res.body.creatorId, user.id);
        assert.equal(res.body.name, payload.name);
        assert.equal(res.body.symbol, payload.symbol);
        assert.equal(res.body.status, "ACTIVE");
    });

    test("needs a token", async () => {
        const res = await api("POST", "/api/launches", { body: launchBody() });
        assert.equal(res.status, 401);
    });

    for (const field of ["name", "symbol", "totalSupply", "pricePerToken", "startsAt", "endsAt", "maxPerWallet", "description"]) {
        test(`returns 400 when ${field} is missing`, async () => {
            const user = await registerUser("missing");
            const payload = launchBody();
            delete payload[field];
            const res = await api("POST", "/api/launches", { token: user.token, body: payload });
            assert.equal(res.status, 400);
        });
    }

    test("returns 400 for an empty body", async () => {
        const user = await registerUser("empty");
        const res = await api("POST", "/api/launches", { token: user.token, body: {} });
        assert.equal(res.status, 400);
    });

    test("stores tiers when they are sent", async () => {
        const user = await registerUser("tiers");
        const tiers = [
            { minAmount: 0, maxAmount: 100, pricePerToken: 1 },
            { minAmount: 100, maxAmount: 200, pricePerToken: 2 },
        ];
        const launch = await createLaunch(user.token, { tiers });
        assert.deepEqual(launch.tiers, tiers);

        const fetched = await api("GET", `/api/launches/${launch.id}`);
        assert.deepEqual(fetched.body.tiers, tiers);
    });

    test("stores vesting when it is sent", async () => {
        const user = await registerUser("vest");
        const vesting = { cliffDays: 30, vestingDays: 90, tgePercent: 10 };
        const launch = await createLaunch(user.token, { vesting });
        assert.deepEqual(launch.vesting, vesting);
    });

    test("works without tiers and vesting", async () => {
        const user = await registerUser("plain");
        const launch = await createLaunch(user.token);
        assert.ok(!launch.tiers);
        assert.ok(!launch.vesting);
    });

    test("duplicate symbol is rejected with a client error", async () => {
        const user = await registerUser("sym");
        const first = await createLaunch(user.token);
        const res = await api("POST", "/api/launches", {
            token: user.token,
            body: launchBody({ symbol: first.symbol }),
        });
        assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
    });

    test("endsAt before startsAt is rejected", async () => {
        const user = await registerUser("dates");
        const res = await api("POST", "/api/launches", {
            token: user.token,
            body: launchBody({ startsAt: daysFromNow(5), endsAt: daysFromNow(1) }),
        });
        assert.equal(res.status, 400);
    });

    test("negative totalSupply is rejected", async () => {
        const user = await registerUser("neg");
        const res = await api("POST", "/api/launches", {
            token: user.token,
            body: launchBody({ totalSupply: -50 }),
        });
        assert.equal(res.status, 400);
    });

    test("garbage in startsAt is rejected and does not crash the server", async () => {
        const user = await registerUser("badate");
        const res = await api("POST", "/api/launches", {
            token: user.token,
            body: launchBody({ startsAt: "not a date" }),
        });
        assert.equal(res.status, 400);
    });
});

describe("computed status", () => {
    test("UPCOMING when startsAt is in the future", async () => {
        const user = await registerUser("up");
        const launch = await createLaunch(user.token, {
            startsAt: daysFromNow(2),
            endsAt: daysFromNow(9),
        });
        assert.equal(launch.status, "UPCOMING");
    });

    test("ENDED when endsAt is in the past", async () => {
        const user = await registerUser("end");
        const launch = await createLaunch(user.token, {
            startsAt: daysFromNow(-9),
            endsAt: daysFromNow(-2),
        });
        assert.equal(launch.status, "ENDED");
    });

    test("ACTIVE when we are between the dates", async () => {
        const user = await registerUser("act");
        const launch = await createLaunch(user.token);
        assert.equal(launch.status, "ACTIVE");
    });

    test("SOLD_OUT after the whole supply is bought", async () => {
        const seller = await registerUser("seller");
        const buyer = await registerUser("buyer");
        const launch = await createLaunch(seller.token, { totalSupply: 100, maxPerWallet: 100 });

        const purchase = await buy(launch.id, buyer.token, { amount: 100 });
        assert.equal(purchase.status, 201);

        const res = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(res.body.status, "SOLD_OUT");
    });

    test("stays ACTIVE after a partial buy", async () => {
        const seller = await registerUser("seller");
        const buyer = await registerUser("buyer");
        const launch = await createLaunch(seller.token, { totalSupply: 100, maxPerWallet: 100 });

        await buy(launch.id, buyer.token, { amount: 99 });
        const res = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(res.body.status, "ACTIVE");
    });
});

describe("get one launch", () => {
    test("returns the launch without a token", async () => {
        const user = await registerUser("get");
        const launch = await createLaunch(user.token);
        const res = await api("GET", `/api/launches/${launch.id}`);

        assert.equal(res.status, 200);
        assert.equal(res.body.id, launch.id);
        assert.equal(res.body.status, "ACTIVE");
    });

    test("404 for an id that does not exist", async () => {
        const res = await api("GET", "/api/launches/99999999");
        assert.equal(res.status, 404);
    });

    test("an id that is not a number is a client error", async () => {
        const res = await api("GET", "/api/launches/abc");
        assert.ok([400, 404].includes(res.status), `got ${res.status}`);
    });

    test("id 0 and negative ids are client errors", async () => {
        const zero = await api("GET", "/api/launches/0");
        const negative = await api("GET", "/api/launches/-5");
        assert.ok([400, 404].includes(zero.status));
        assert.ok([400, 404].includes(negative.status));
    });
});

describe("list launches", () => {
    test("returns launches, total, page and limit", async () => {
        const user = await registerUser("list");
        await createLaunch(user.token);

        const res = await api("GET", "/api/launches");
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.launches));
        assert.equal(typeof res.body.total, "number");
        assert.equal(res.body.page, 1);
        assert.equal(res.body.limit, 10);
        assert.ok(res.body.launches.length <= 10);
        assert.ok(res.body.total >= 1);
    });

    test("every launch in the list has a status", async () => {
        const res = await api("GET", "/api/launches?limit=50");
        for (const launch of res.body.launches) {
            assert.ok(["UPCOMING", "ACTIVE", "ENDED", "SOLD_OUT"].includes(launch.status));
        }
    });

    test("limit is respected", async () => {
        const user = await registerUser("limit");
        await createLaunch(user.token);
        await createLaunch(user.token);
        await createLaunch(user.token);

        const res = await api("GET", "/api/launches?limit=2");
        assert.equal(res.body.launches.length, 2);
        assert.equal(res.body.limit, 2);
    });

    test("page 2 returns its own page of launches, newest first", async () => {
        const user = await registerUser("pages");
        await createLaunch(user.token);
        await createLaunch(user.token);
        await createLaunch(user.token);

        const second = await api("GET", "/api/launches?page=2&limit=2");
        assert.equal(second.body.page, 2);
        assert.equal(second.body.launches.length, 2);

        // other tests add launches while this one runs, so we only check the order
        assert.ok(second.body.launches[0].id > second.body.launches[1].id);
    });

    test("a page far past the end is empty but still 200", async () => {
        const res = await api("GET", "/api/launches?page=99999&limit=10");
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.launches, []);
    });

    test("status filter only returns that status", async () => {
        const user = await registerUser("filter");
        await createLaunch(user.token, { startsAt: daysFromNow(3), endsAt: daysFromNow(10) });
        await createLaunch(user.token, { startsAt: daysFromNow(-10), endsAt: daysFromNow(-3) });
        await createLaunch(user.token);

        for (const status of ["UPCOMING", "ENDED", "ACTIVE"]) {
            const res = await api("GET", `/api/launches?status=${status}&limit=100`);
            assert.equal(res.status, 200);
            assert.ok(res.body.launches.length > 0, `no launches for ${status}`);
            for (const launch of res.body.launches) {
                assert.equal(launch.status, status);
            }
        }
    });

    test("SOLD_OUT filter finds a sold out launch", async () => {
        const seller = await registerUser("so_seller");
        const buyer = await registerUser("so_buyer");
        const launch = await createLaunch(seller.token, { totalSupply: 10, maxPerWallet: 10 });
        await buy(launch.id, buyer.token, { amount: 10 });

        const res = await api("GET", "/api/launches?status=SOLD_OUT&limit=100");
        const ids = res.body.launches.map((l) => l.id);
        assert.ok(ids.includes(launch.id));
        for (const l of res.body.launches) {
            assert.equal(l.status, "SOLD_OUT");
        }
    });

    test("a sold out launch does not show up under ACTIVE", async () => {
        const seller = await registerUser("sa_seller");
        const buyer = await registerUser("sa_buyer");
        const launch = await createLaunch(seller.token, { totalSupply: 10, maxPerWallet: 10 });
        await buy(launch.id, buyer.token, { amount: 10 });

        const res = await api("GET", "/api/launches?status=ACTIVE&limit=100");
        const ids = res.body.launches.map((l) => l.id);
        assert.ok(!ids.includes(launch.id));
    });

    test("total matches the filter, not the whole table", async () => {
        const all = await api("GET", "/api/launches?limit=1");
        const upcoming = await api("GET", "/api/launches?status=UPCOMING&limit=1");
        assert.ok(upcoming.body.total <= all.body.total);
    });

    test("bad page and limit values fall back instead of crashing", async () => {
        const res = await api("GET", "/api/launches?page=abc&limit=xyz");
        assert.equal(res.status, 200);
    });

    test("an unknown status value does not crash the server", async () => {
        const res = await api("GET", "/api/launches?status=BANANA");
        assert.ok([200, 400].includes(res.status));
    });
});

describe("update launch", () => {
    test("creator can change the description", async () => {
        const user = await registerUser("upd");
        const launch = await createLaunch(user.token);

        const res = await api("PUT", `/api/launches/${launch.id}`, {
            token: user.token,
            body: { description: "new text" },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.description, "new text");

        const fetched = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(fetched.body.description, "new text");
    });

    test("update keeps the fields that were not sent", async () => {
        const user = await registerUser("keep");
        const launch = await createLaunch(user.token, { name: "Keep" });

        const res = await api("PUT", `/api/launches/${launch.id}`, {
            token: user.token,
            body: { description: "changed" },
        });
        assert.equal(res.body.name, "Keep");
        assert.equal(res.body.symbol, launch.symbol);
    });

    test("response still has the computed status", async () => {
        const user = await registerUser("updstatus");
        const launch = await createLaunch(user.token);
        const res = await api("PUT", `/api/launches/${launch.id}`, {
            token: user.token,
            body: { description: "x" },
        });
        assert.equal(res.body.status, "ACTIVE");
    });

    test("moving the dates into the future flips the status to UPCOMING", async () => {
        const user = await registerUser("move");
        const launch = await createLaunch(user.token);
        const res = await api("PUT", `/api/launches/${launch.id}`, {
            token: user.token,
            body: { startsAt: daysFromNow(3), endsAt: daysFromNow(10) },
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, "UPCOMING");
    });

    test("no token gives 401", async () => {
        const user = await registerUser("upd401");
        const launch = await createLaunch(user.token);
        const res = await api("PUT", `/api/launches/${launch.id}`, { body: { description: "x" } });
        assert.equal(res.status, 401);
    });

    test("another user gets 403 and nothing changes", async () => {
        const owner = await registerUser("owner");
        const other = await registerUser("other");
        const launch = await createLaunch(owner.token);

        const res = await api("PUT", `/api/launches/${launch.id}`, {
            token: other.token,
            body: { description: "hacked" },
        });
        assert.equal(res.status, 403);

        const fetched = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(fetched.body.description, launch.description);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("upd404");
        const res = await api("PUT", "/api/launches/99999999", {
            token: user.token,
            body: { description: "x" },
        });
        assert.equal(res.status, 404);
    });

    test("cannot change the creator through the body", async () => {
        const owner = await registerUser("owner2");
        const other = await registerUser("other2");
        const launch = await createLaunch(owner.token);

        await api("PUT", `/api/launches/${launch.id}`, {
            token: owner.token,
            body: { creatorId: other.id },
        });
        const fetched = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(fetched.body.creatorId, owner.id);
    });

    test("a symbol already used by another launch is a client error", async () => {
        const user = await registerUser("symdup");
        const a = await createLaunch(user.token);
        const b = await createLaunch(user.token);
        const res = await api("PUT", `/api/launches/${b.id}`, {
            token: user.token,
            body: { symbol: a.symbol },
        });
        assert.ok(res.status >= 400 && res.status < 500, `got ${res.status}`);
    });
});
