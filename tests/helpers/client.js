// Small helpers shared by all the test files.
// The server must already be running (for example: npx tsx src/index.ts).

export const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export async function api(method, path, { body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(BASE_URL + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;
    const text = await res.text();
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }
    return { status: res.status, body: data };
}

let counter = 0;

// Short random string so repeated runs do not clash on unique columns.
export function uid() {
    counter += 1;
    return Math.random().toString(36).slice(2, 7) + counter;
}

export async function registerUser(label = "user") {
    const email = `${label}_${uid()}@test.com`;
    const password = "secret123";
    const res = await api("POST", "/api/auth/register", {
        body: { email, password, name: label },
    });
    if (res.status !== 201) {
        throw new Error(`could not register test user: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { email, password, token: res.body.token, id: res.body.user.id };
}

export function daysFromNow(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// A launch that is live right now. Override anything you need.
export function launchBody(overrides = {}) {
    return {
        name: "Test",
        symbol: "T" + uid().toUpperCase().slice(0, 8),
        totalSupply: 1000,
        pricePerToken: 1,
        startsAt: daysFromNow(-1),
        endsAt: daysFromNow(7),
        maxPerWallet: 500,
        description: "a launch used in tests",
        ...overrides,
    };
}

export async function createLaunch(token, overrides = {}) {
    const res = await api("POST", "/api/launches", {
        token,
        body: launchBody(overrides),
    });
    if (res.status !== 201) {
        throw new Error(`could not create test launch: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body;
}

export function purchaseBody(overrides = {}) {
    return {
        walletAddress: "wallet_" + uid(),
        amount: 10,
        txSignature: "sig_" + uid(),
        ...overrides,
    };
}

export function buy(launchId, token, overrides = {}) {
    return api("POST", `/api/launches/${launchId}/purchase`, {
        token,
        body: purchaseBody(overrides),
    });
}
