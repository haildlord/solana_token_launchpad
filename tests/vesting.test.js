import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, registerUser, createLaunch, buy } from "./helpers/client.js";

const vesting = { cliffDays: 30, vestingDays: 100, tgePercent: 10 };

async function launchWithPurchase(launchOverrides, wallet, amount) {
    const owner = await registerUser("v_owner");
    const buyer = await registerUser("v_buyer");
    const launch = await createLaunch(owner.token, { maxPerWallet: 100000, totalSupply: 100000, ...launchOverrides });
    if (amount) {
        const res = await buy(launch.id, buyer.token, { walletAddress: wallet, amount });
        assert.equal(res.status, 201);
    }
    return { owner, buyer, launch };
}

function vestingFor(launchId, token, wallet) {
    const query = wallet === undefined ? "" : `?walletAddress=${wallet}`;
    return api("GET", `/api/launches/${launchId}/vesting${query}`, { token });
}

describe("with a vesting schedule", () => {
    test("returns every field", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw1", 1000);
        const res = await vestingFor(launch.id, buyer.token, "vw1");

        assert.equal(res.status, 200);
        for (const key of ["totalPurchased", "tgeAmount", "cliffEndsAt", "vestedAmount", "lockedAmount", "claimableAmount"]) {
            assert.ok(key in res.body, `missing ${key}`);
        }
    });

    test("totalPurchased is the sum of the wallet purchases", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw2", 400);
        await buy(launch.id, buyer.token, { walletAddress: "vw2", amount: 600 });

        const res = await vestingFor(launch.id, buyer.token, "vw2");
        assert.equal(Number(res.body.totalPurchased), 1000);
    });

    test("tgeAmount is tgePercent of the total", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw3", 1000);
        const res = await vestingFor(launch.id, buyer.token, "vw3");
        assert.equal(Number(res.body.tgeAmount), 100);
    });

    test("tgeAmount is rounded down", async () => {
        // 10% of 99 is 9.9, floor gives 9
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw4", 99);
        const res = await vestingFor(launch.id, buyer.token, "vw4");
        assert.equal(Number(res.body.tgeAmount), 9);
    });

    test("before the cliff only the tge part can be claimed", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw5", 1000);
        const res = await vestingFor(launch.id, buyer.token, "vw5");

        assert.equal(Number(res.body.claimableAmount), 100);
        assert.equal(Number(res.body.lockedAmount), 900);
    });

    test("claimable plus locked is always the total", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw6", 777);
        const res = await vestingFor(launch.id, buyer.token, "vw6");
        const sum = Number(res.body.claimableAmount) + Number(res.body.lockedAmount);
        assert.equal(sum, 777);
    });

    test("cliffEndsAt is a date in the future for a fresh launch", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw7", 100);
        const res = await vestingFor(launch.id, buyer.token, "vw7");
        const cliff = new Date(res.body.cliffEndsAt);
        assert.ok(!Number.isNaN(cliff.getTime()));
        assert.ok(cliff.getTime() > Date.now());
    });

    test("tgePercent of 100 unlocks everything straight away", async () => {
        const { buyer, launch } = await launchWithPurchase(
            { vesting: { cliffDays: 30, vestingDays: 100, tgePercent: 100 } },
            "vw8",
            500
        );
        const res = await vestingFor(launch.id, buyer.token, "vw8");
        assert.equal(Number(res.body.tgeAmount), 500);
        assert.equal(Number(res.body.claimableAmount), 500);
        assert.equal(Number(res.body.lockedAmount), 0);
    });

    test("a wallet with no purchases gets zeros", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw9", 100);
        const res = await vestingFor(launch.id, buyer.token, "never_bought");
        assert.equal(res.status, 200);
        assert.equal(Number(res.body.totalPurchased), 0);
        assert.equal(Number(res.body.tgeAmount), 0);
        assert.equal(Number(res.body.claimableAmount), 0);
    });

    test("only the asked wallet is counted", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "vw10", 300);
        await buy(launch.id, buyer.token, { walletAddress: "vw10_other", amount: 200 });

        const res = await vestingFor(launch.id, buyer.token, "vw10");
        assert.equal(Number(res.body.totalPurchased), 300);
    });
});

describe("without a vesting schedule", () => {
    test("everything is claimable right away", async () => {
        const { buyer, launch } = await launchWithPurchase({}, "nv1", 250);
        const res = await vestingFor(launch.id, buyer.token, "nv1");

        assert.equal(res.status, 200);
        assert.equal(Number(res.body.totalPurchased), 250);
        assert.equal(Number(res.body.claimableAmount), 250);
        assert.equal(Number(res.body.lockedAmount), 0);
    });

    test("no purchases means nothing to claim", async () => {
        const { buyer, launch } = await launchWithPurchase({}, "nv2", 0);
        const res = await vestingFor(launch.id, buyer.token, "nv2");
        assert.equal(res.status, 200);
        assert.equal(Number(res.body.claimableAmount), 0);
    });
});

describe("vesting errors", () => {
    test("missing walletAddress gives 400", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "ve1", 10);
        const res = await vestingFor(launch.id, buyer.token);
        assert.equal(res.status, 400);
    });

    test("empty walletAddress gives 400", async () => {
        const { buyer, launch } = await launchWithPurchase({ vesting }, "ve2", 10);
        const res = await vestingFor(launch.id, buyer.token, "");
        assert.equal(res.status, 400);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("v_404");
        const res = await vestingFor(99999999, user.token, "anything");
        assert.equal(res.status, 404);
    });

    test("no token gives 401", async () => {
        const { launch } = await launchWithPurchase({ vesting }, "ve3", 10);
        const res = await vestingFor(launch.id, undefined, "ve3");
        assert.equal(res.status, 401);
    });
});
