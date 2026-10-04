import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, registerUser, createLaunch, buy, daysFromNow, uid } from "./helpers/client.js";

describe("basic purchase", () => {
    test("records a purchase with the computed totalCost", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token, { pricePerToken: 2 });

        const res = await buy(launch.id, buyer.token, { amount: 25, walletAddress: "w1", txSignature: "sig_basic_" + uid() });
        assert.equal(res.status, 201);
        assert.equal(res.body.userId, buyer.id);
        assert.equal(res.body.walletAddress, "w1");
        assert.equal(Number(res.body.amount), 25);
        assert.equal(Number(res.body.totalCost), 50);
        assert.ok(res.body.txSignature);
    });

    test("decimal price works", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token, { pricePerToken: 0.5 });

        const res = await buy(launch.id, buyer.token, { amount: 11 });
        assert.equal(res.status, 201);
        assert.equal(Number(res.body.totalCost), 5.5);
    });

    test("no token gives 401", async () => {
        const owner = await registerUser("p_owner");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, undefined);
        assert.equal(res.status, 401);
    });

    test("unknown launch gives 404", async () => {
        const buyer = await registerUser("p_buyer");
        const res = await buy(99999999, buyer.token);
        assert.equal(res.status, 404);
    });

    test("the creator can buy from their own launch", async () => {
        const owner = await registerUser("p_owner");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, owner.token);
        assert.equal(res.status, 201);
    });

    for (const field of ["walletAddress", "amount", "txSignature"]) {
        test(`missing ${field} gives 400`, async () => {
            const owner = await registerUser("p_owner");
            const buyer = await registerUser("p_buyer");
            const launch = await createLaunch(owner.token);

            const body = { walletAddress: "w_" + uid(), amount: 10, txSignature: "sig_" + uid() };
            delete body[field];
            const res = await api("POST", `/api/launches/${launch.id}/purchase`, { token: buyer.token, body });
            assert.equal(res.status, 400);
        });
    }

    test("amount of zero gives 400", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, buyer.token, { amount: 0 });
        assert.equal(res.status, 400);
    });

    test("negative amount gives 400", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, buyer.token, { amount: -10 });
        assert.equal(res.status, 400);
    });

    test("amount as a string gives 400", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, buyer.token, { amount: "ten" });
        assert.equal(res.status, 400);
    });

    test("the same txSignature twice gives 400", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token);

        const sig = "dup_sig_" + uid();
        const first = await buy(launch.id, buyer.token, { txSignature: sig });
        const second = await buy(launch.id, buyer.token, { txSignature: sig });
        assert.equal(first.status, 201);
        assert.equal(second.status, 400);
    });

    test("a rejected duplicate does not count towards the total", async () => {
        const owner = await registerUser("p_owner");
        const buyer = await registerUser("p_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });

        const sig = "dup_sig_" + uid();
        await buy(launch.id, buyer.token, { txSignature: sig, amount: 60 });
        await buy(launch.id, buyer.token, { txSignature: sig, amount: 60 });

        // 60 already bought, 40 more should still fit under the 100 limit
        const res = await buy(launch.id, buyer.token, { amount: 40 });
        assert.equal(res.status, 201);
    });
});

describe("launch state", () => {
    test("UPCOMING launch rejects purchases", async () => {
        const owner = await registerUser("s_owner");
        const buyer = await registerUser("s_buyer");
        const launch = await createLaunch(owner.token, { startsAt: daysFromNow(2), endsAt: daysFromNow(9) });
        const res = await buy(launch.id, buyer.token);
        assert.equal(res.status, 400);
    });

    test("ENDED launch rejects purchases", async () => {
        const owner = await registerUser("s_owner");
        const buyer = await registerUser("s_buyer");
        const launch = await createLaunch(owner.token, { startsAt: daysFromNow(-9), endsAt: daysFromNow(-2) });
        const res = await buy(launch.id, buyer.token);
        assert.equal(res.status, 400);
    });

    test("SOLD_OUT launch rejects purchases", async () => {
        const owner = await registerUser("s_owner");
        const buyer = await registerUser("s_buyer");
        const other = await registerUser("s_other");
        const launch = await createLaunch(owner.token, { totalSupply: 50, maxPerWallet: 50 });

        const first = await buy(launch.id, buyer.token, { amount: 50 });
        assert.equal(first.status, 201);

        const res = await buy(launch.id, other.token, { amount: 1 });
        assert.equal(res.status, 400);
    });

    test("cannot buy more than the total supply", async () => {
        const owner = await registerUser("s_owner");
        const buyer = await registerUser("s_buyer");
        const launch = await createLaunch(owner.token, { totalSupply: 100, maxPerWallet: 1000 });
        const res = await buy(launch.id, buyer.token, { amount: 101 });
        assert.equal(res.status, 400);
    });

    test("cannot go over supply across two buyers", async () => {
        const owner = await registerUser("s_owner");
        const a = await registerUser("s_a");
        const b = await registerUser("s_b");
        const launch = await createLaunch(owner.token, { totalSupply: 100, maxPerWallet: 1000 });

        const first = await buy(launch.id, a.token, { amount: 80 });
        const second = await buy(launch.id, b.token, { amount: 30 });
        assert.equal(first.status, 201);
        assert.equal(second.status, 400);
    });

    test("buying exactly the remaining supply works", async () => {
        const owner = await registerUser("s_owner");
        const a = await registerUser("s_a");
        const b = await registerUser("s_b");
        const launch = await createLaunch(owner.token, { totalSupply: 100, maxPerWallet: 1000 });

        await buy(launch.id, a.token, { amount: 80 });
        const res = await buy(launch.id, b.token, { amount: 20 });
        assert.equal(res.status, 201);
    });
});

describe("maxPerWallet is per user", () => {
    test("one buy over the limit gives 400", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });
        const res = await buy(launch.id, buyer.token, { amount: 101 });
        assert.equal(res.status, 400);
    });

    test("buying exactly the limit is fine", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });
        const res = await buy(launch.id, buyer.token, { amount: 100 });
        assert.equal(res.status, 201);
    });

    test("two purchases from the same wallet add up", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });

        const first = await buy(launch.id, buyer.token, { amount: 60, walletAddress: "same_wallet" });
        const second = await buy(launch.id, buyer.token, { amount: 50, walletAddress: "same_wallet" });
        assert.equal(first.status, 201);
        assert.equal(second.status, 400);
    });

    test("using a second wallet does not get around the limit", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });

        const first = await buy(launch.id, buyer.token, { amount: 60, walletAddress: "wallet_a" });
        const second = await buy(launch.id, buyer.token, { amount: 50, walletAddress: "wallet_b" });
        assert.equal(first.status, 201);
        assert.equal(second.status, 400);
    });

    test("many small buys over many wallets still hit the limit", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const launch = await createLaunch(owner.token, { maxPerWallet: 30 });

        for (let i = 0; i < 3; i++) {
            const ok = await buy(launch.id, buyer.token, { amount: 10, walletAddress: "w" + i });
            assert.equal(ok.status, 201);
        }
        const res = await buy(launch.id, buyer.token, { amount: 1, walletAddress: "w_extra" });
        assert.equal(res.status, 400);
    });

    test("a different user has their own limit", async () => {
        const owner = await registerUser("m_owner");
        const a = await registerUser("m_a");
        const b = await registerUser("m_b");
        const launch = await createLaunch(owner.token, { maxPerWallet: 100 });

        await buy(launch.id, a.token, { amount: 100 });
        const res = await buy(launch.id, b.token, { amount: 100 });
        assert.equal(res.status, 201);
    });

    test("the limit is separate for each launch", async () => {
        const owner = await registerUser("m_owner");
        const buyer = await registerUser("m_buyer");
        const one = await createLaunch(owner.token, { maxPerWallet: 50 });
        const two = await createLaunch(owner.token, { maxPerWallet: 50 });

        await buy(one.id, buyer.token, { amount: 50 });
        const res = await buy(two.id, buyer.token, { amount: 50 });
        assert.equal(res.status, 201);
    });
});

describe("whitelist rules", () => {
    test("any wallet can buy when the whitelist is empty", async () => {
        const owner = await registerUser("w_owner");
        const buyer = await registerUser("w_buyer");
        const launch = await createLaunch(owner.token);
        const res = await buy(launch.id, buyer.token, { walletAddress: "random_wallet" });
        assert.equal(res.status, 201);
    });

    test("a wallet that is not listed gets 400", async () => {
        const owner = await registerUser("w_owner");
        const buyer = await registerUser("w_buyer");
        const launch = await createLaunch(owner.token);
        await api("POST", `/api/launches/${launch.id}/whitelist`, {
            token: owner.token,
            body: { addresses: ["allowed_wallet"] },
        });

        const res = await buy(launch.id, buyer.token, { walletAddress: "not_allowed_wallet" });
        assert.equal(res.status, 400);
    });

    test("a listed wallet can buy", async () => {
        const owner = await registerUser("w_owner");
        const buyer = await registerUser("w_buyer");
        const launch = await createLaunch(owner.token);
        await api("POST", `/api/launches/${launch.id}/whitelist`, {
            token: owner.token,
            body: { addresses: ["allowed_wallet"] },
        });

        const res = await buy(launch.id, buyer.token, { walletAddress: "allowed_wallet" });
        assert.equal(res.status, 201);
    });

    test("removing the only address makes the launch open again", async () => {
        const owner = await registerUser("w_owner");
        const buyer = await registerUser("w_buyer");
        const launch = await createLaunch(owner.token);
        const path = `/api/launches/${launch.id}/whitelist`;
        await api("POST", path, { token: owner.token, body: { addresses: ["only_one"] } });
        await api("DELETE", `${path}/only_one`, { token: owner.token });

        const res = await buy(launch.id, buyer.token, { walletAddress: "anyone" });
        assert.equal(res.status, 201);
    });

    test("whitelist of another launch does not matter", async () => {
        const owner = await registerUser("w_owner");
        const buyer = await registerUser("w_buyer");
        const one = await createLaunch(owner.token);
        const two = await createLaunch(owner.token);
        await api("POST", `/api/launches/${one.id}/whitelist`, {
            token: owner.token,
            body: { addresses: ["only_for_one"] },
        });

        const res = await buy(two.id, buyer.token, { walletAddress: "free_wallet" });
        assert.equal(res.status, 201);
    });
});

describe("tiered pricing", () => {
    const tiers = [
        { minAmount: 0, maxAmount: 100, pricePerToken: 1 },
        { minAmount: 100, maxAmount: 200, pricePerToken: 2 },
    ];

    async function tieredLaunch(extra = {}) {
        const owner = await registerUser("t_owner");
        const buyer = await registerUser("t_buyer");
        const launch = await createLaunch(owner.token, {
            tiers,
            pricePerToken: 3,
            totalSupply: 1000,
            maxPerWallet: 1000,
            ...extra,
        });
        return { owner, buyer, launch };
    }

    test("amount inside the first tier uses the first price", async () => {
        const { buyer, launch } = await tieredLaunch();
        const res = await buy(launch.id, buyer.token, { amount: 50 });
        assert.equal(res.status, 201);
        assert.equal(Number(res.body.totalCost), 50);
    });

    test("amount exactly filling the first tier", async () => {
        const { buyer, launch } = await tieredLaunch();
        const res = await buy(launch.id, buyer.token, { amount: 100 });
        assert.equal(Number(res.body.totalCost), 100);
    });

    test("amount that spills into the second tier", async () => {
        const { buyer, launch } = await tieredLaunch();
        const res = await buy(launch.id, buyer.token, { amount: 150 });
        // 100 * 1 + 50 * 2
        assert.equal(Number(res.body.totalCost), 200);
    });

    test("amount that fills every tier", async () => {
        const { buyer, launch } = await tieredLaunch();
        const res = await buy(launch.id, buyer.token, { amount: 200 });
        // 100 * 1 + 100 * 2
        assert.equal(Number(res.body.totalCost), 300);
    });

    test("amount beyond all tiers uses the flat price for the rest", async () => {
        const { buyer, launch } = await tieredLaunch();
        const res = await buy(launch.id, buyer.token, { amount: 250 });
        // 100 * 1 + 100 * 2 + 50 * 3
        assert.equal(Number(res.body.totalCost), 450);
    });

    test("tier capacity is maxAmount minus minAmount, not maxAmount", async () => {
        const { buyer, launch } = await tieredLaunch({
            tiers: [
                { minAmount: 50, maxAmount: 100, pricePerToken: 1 },
                { minAmount: 100, maxAmount: 150, pricePerToken: 4 },
            ],
        });
        const res = await buy(launch.id, buyer.token, { amount: 60 });
        // first tier holds 50 tokens, so 50 * 1 + 10 * 4
        assert.equal(Number(res.body.totalCost), 90);
    });

    test("without tiers it is amount times price", async () => {
        const owner = await registerUser("t_owner");
        const buyer = await registerUser("t_buyer");
        const launch = await createLaunch(owner.token, { pricePerToken: 3 });
        const res = await buy(launch.id, buyer.token, { amount: 7 });
        assert.equal(Number(res.body.totalCost), 21);
    });
});

describe("referral codes on purchase", () => {
    async function withCode(codeOverrides = {}) {
        const owner = await registerUser("r_owner");
        const buyer = await registerUser("r_buyer");
        const launch = await createLaunch(owner.token, { pricePerToken: 1 });
        const code = "REF" + uid();
        const created = await api("POST", `/api/launches/${launch.id}/referrals`, {
            token: owner.token,
            body: { code, discountPercent: 10, maxUses: 2, ...codeOverrides },
        });
        assert.equal(created.status, 201);
        return { owner, buyer, launch, code };
    }

    test("discount is taken off the total cost", async () => {
        const { buyer, launch, code } = await withCode();
        const res = await buy(launch.id, buyer.token, { amount: 100, referralCode: code });
        assert.equal(res.status, 201);
        assert.equal(Number(res.body.totalCost), 90);
    });

    test("100 percent discount makes it free", async () => {
        const { buyer, launch, code } = await withCode({ discountPercent: 100 });
        const res = await buy(launch.id, buyer.token, { amount: 100, referralCode: code });
        assert.equal(res.status, 201);
        assert.equal(Number(res.body.totalCost), 0);
    });

    test("discount works together with tiers", async () => {
        const owner = await registerUser("r_owner");
        const buyer = await registerUser("r_buyer");
        const launch = await createLaunch(owner.token, {
            tiers: [{ minAmount: 0, maxAmount: 100, pricePerToken: 1 }, { minAmount: 100, maxAmount: 200, pricePerToken: 2 }],
            totalSupply: 1000,
            maxPerWallet: 1000,
        });
        await api("POST", `/api/launches/${launch.id}/referrals`, {
            token: owner.token,
            body: { code: "TIERDISC", discountPercent: 50, maxUses: 5 },
        });
        const res = await buy(launch.id, buyer.token, { amount: 150, referralCode: "TIERDISC" });
        // 200 before discount, half of it
        assert.equal(Number(res.body.totalCost), 100);
    });

    test("usedCount goes up after a purchase", async () => {
        const { owner, buyer, launch, code } = await withCode();
        await buy(launch.id, buyer.token, { referralCode: code });

        const res = await api("GET", `/api/launches/${launch.id}/referrals`, { token: owner.token });
        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        const found = list.find((r) => r.code === code);
        assert.equal(found.usedCount, 1);
    });

    test("code that does not exist gives 400", async () => {
        const { buyer, launch } = await withCode();
        const res = await buy(launch.id, buyer.token, { referralCode: "NOPE" });
        assert.equal(res.status, 400);
    });

    test("code from a different launch gives 400", async () => {
        const first = await withCode();
        const second = await withCode();
        const res = await buy(second.launch.id, second.buyer.token, { referralCode: first.code });
        assert.equal(res.status, 400);
    });

    test("used up code gives 400", async () => {
        const { owner, launch, code } = await withCode({ maxUses: 1 });
        const a = await registerUser("r_a");
        const b = await registerUser("r_b");

        const first = await buy(launch.id, a.token, { referralCode: code });
        const second = await buy(launch.id, b.token, { referralCode: code });
        assert.equal(first.status, 201);
        assert.equal(second.status, 400);

        const res = await api("GET", `/api/launches/${launch.id}/referrals`, { token: owner.token });
        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        assert.equal(list.find((r) => r.code === code).usedCount, 1);
    });

    test("a failed purchase does not use up the code", async () => {
        const { owner, buyer, launch, code } = await withCode({ maxUses: 1 });
        // amount is over maxPerWallet so the purchase fails
        const failed = await buy(launch.id, buyer.token, { amount: 100000, referralCode: code });
        assert.equal(failed.status, 400);

        const res = await api("GET", `/api/launches/${launch.id}/referrals`, { token: owner.token });
        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        assert.equal(list.find((r) => r.code === code).usedCount, 0);
    });

    test("a duplicate txSignature does not use up the code", async () => {
        const { owner, buyer, launch, code } = await withCode({ maxUses: 5 });
        const sig = "sig_ref_" + uid();
        await buy(launch.id, buyer.token, { txSignature: sig });
        await buy(launch.id, buyer.token, { txSignature: sig, referralCode: code });

        const res = await api("GET", `/api/launches/${launch.id}/referrals`, { token: owner.token });
        const list = Array.isArray(res.body) ? res.body : res.body.referrals;
        assert.equal(list.find((r) => r.code === code).usedCount, 0);
    });

    test("purchase without a code is full price", async () => {
        const { buyer, launch } = await withCode();
        const res = await buy(launch.id, buyer.token, { amount: 100 });
        assert.equal(Number(res.body.totalCost), 100);
    });
});

describe("list purchases", () => {
    async function setup() {
        const owner = await registerUser("l_owner");
        const a = await registerUser("l_a");
        const b = await registerUser("l_b");
        const launch = await createLaunch(owner.token);
        await buy(launch.id, a.token, { amount: 10 });
        await buy(launch.id, a.token, { amount: 20 });
        await buy(launch.id, b.token, { amount: 30 });
        return { owner, a, b, launch, path: `/api/launches/${launch.id}/purchases` };
    }

    test("creator sees all purchases", async () => {
        const { owner, path } = await setup();
        const res = await api("GET", path, { token: owner.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 3);
        assert.equal(res.body.purchases.length, 3);
    });

    test("a buyer only sees their own purchases", async () => {
        const { a, path } = await setup();
        const res = await api("GET", path, { token: a.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.total, 2);
        for (const p of res.body.purchases) {
            assert.equal(p.userId, a.id);
        }
    });

    test("every purchase has the expected fields", async () => {
        const { owner, path } = await setup();
        const res = await api("GET", path, { token: owner.token });
        for (const p of res.body.purchases) {
            assert.ok(p.id);
            assert.ok(p.userId);
            assert.ok(p.walletAddress);
            assert.ok(p.amount !== undefined);
            assert.ok(p.totalCost !== undefined);
            assert.ok(p.txSignature);
        }
    });

    test("a user who bought nothing gets an empty list", async () => {
        const { path } = await setup();
        const nobody = await registerUser("l_nobody");
        const res = await api("GET", path, { token: nobody.token });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.purchases, []);
        assert.equal(res.body.total, 0);
    });

    test("no token gives 401", async () => {
        const { path } = await setup();
        const res = await api("GET", path);
        assert.equal(res.status, 401);
    });

    test("purchases of another launch are not mixed in", async () => {
        const { owner, a } = await setup();
        const other = await createLaunch(owner.token);
        await buy(other.id, a.token, { amount: 5 });

        const res = await api("GET", `/api/launches/${other.id}/purchases`, { token: owner.token });
        assert.equal(res.body.total, 1);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("l_404");
        const res = await api("GET", "/api/launches/99999999/purchases", { token: user.token });
        assert.equal(res.status, 404);
    });
});
