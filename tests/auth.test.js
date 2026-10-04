import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { api, uid, registerUser, BASE_URL } from "./helpers/client.js";

describe("register", () => {
    test("creates a user and returns a token", async () => {
        const email = `new_${uid()}@test.com`;
        const res = await api("POST", "/api/auth/register", {
            body: { email, password: "pass1234", name: "Alice" },
        });

        assert.equal(res.status, 201);
        assert.ok(res.body.token);
        assert.equal(res.body.user.email, email);
        assert.equal(res.body.user.name, "Alice");
        assert.ok(res.body.user.id);
    });

    test("never sends the password back", async () => {
        const res = await api("POST", "/api/auth/register", {
            body: { email: `nopw_${uid()}@test.com`, password: "pass1234", name: "Bob" },
        });

        assert.equal(res.status, 201);
        assert.equal(res.body.user.password, undefined);
        assert.ok(!JSON.stringify(res.body).includes("pass1234"));
    });

    test("fails with 400 when email is missing", async () => {
        const res = await api("POST", "/api/auth/register", {
            body: { password: "pass1234", name: "No Email" },
        });
        assert.equal(res.status, 400);
    });

    test("fails with 400 when password is missing", async () => {
        const res = await api("POST", "/api/auth/register", {
            body: { email: `x_${uid()}@test.com`, name: "No Pass" },
        });
        assert.equal(res.status, 400);
    });

    test("fails with 400 when name is missing", async () => {
        const res = await api("POST", "/api/auth/register", {
            body: { email: `x_${uid()}@test.com`, password: "pass1234" },
        });
        assert.equal(res.status, 400);
    });

    test("fails with 400 when body is empty", async () => {
        const res = await api("POST", "/api/auth/register", { body: {} });
        assert.equal(res.status, 400);
    });

    test("fails with 400 when fields are empty strings", async () => {
        const res = await api("POST", "/api/auth/register", {
            body: { email: "", password: "", name: "" },
        });
        assert.equal(res.status, 400);
    });

    test("fails with 409 when the email is already used", async () => {
        const user = await registerUser("dup");
        const res = await api("POST", "/api/auth/register", {
            body: { email: user.email, password: "other1234", name: "Copy" },
        });
        assert.equal(res.status, 409);
    });

    test("two different users get different ids", async () => {
        const a = await registerUser("a");
        const b = await registerUser("b");
        assert.notEqual(a.id, b.id);
    });
});

describe("login", () => {
    test("works with the right email and password", async () => {
        const user = await registerUser("login");
        const res = await api("POST", "/api/auth/login", {
            body: { email: user.email, password: user.password },
        });

        assert.equal(res.status, 200);
        assert.ok(res.body.token);
        assert.equal(res.body.user.email, user.email);
        assert.equal(res.body.user.id, user.id);
        assert.equal(res.body.user.password, undefined);
    });

    test("token from login can be used on a protected route", async () => {
        const user = await registerUser("tok");
        const login = await api("POST", "/api/auth/login", {
            body: { email: user.email, password: user.password },
        });
        const res = await api("POST", "/api/launches", {
            token: login.body.token,
            body: {},
        });
        // empty body, so 400 is fine. The point is that it is not 401.
        assert.notEqual(res.status, 401);
    });

    test("wrong password gives 401", async () => {
        const user = await registerUser("wrongpw");
        const res = await api("POST", "/api/auth/login", {
            body: { email: user.email, password: "not-the-password" },
        });
        assert.equal(res.status, 401);
        assert.equal(res.body.token, undefined);
    });

    test("unknown email gives 401", async () => {
        const res = await api("POST", "/api/auth/login", {
            body: { email: `ghost_${uid()}@test.com`, password: "whatever1" },
        });
        assert.equal(res.status, 401);
    });

    test("missing password gives 401", async () => {
        const user = await registerUser("nopass");
        const res = await api("POST", "/api/auth/login", {
            body: { email: user.email },
        });
        assert.equal(res.status, 401);
    });

    test("missing email gives 401", async () => {
        const res = await api("POST", "/api/auth/login", {
            body: { password: "whatever1" },
        });
        assert.equal(res.status, 401);
    });

    test("logging in with an upper case email does not crash the server", async () => {
        // Not defined by the spec, so we only check the server does not crash.
        const user = await registerUser("case");
        const res = await api("POST", "/api/auth/login", {
            body: { email: user.email.toUpperCase(), password: user.password },
        });
        assert.ok([200, 401].includes(res.status));
    });
});

describe("token checks on protected routes", () => {
    test("no Authorization header gives 401", async () => {
        const res = await api("POST", "/api/launches", { body: {} });
        assert.equal(res.status, 401);
    });

    test("random string as token gives 401", async () => {
        const res = await api("POST", "/api/launches", { token: "abc.def.ghi", body: {} });
        assert.equal(res.status, 401);
    });

    test("tampered token gives 401", async () => {
        const user = await registerUser("tamper");
        const broken = user.token.slice(0, -3) + "xyz";
        const res = await api("POST", "/api/launches", { token: broken, body: {} });
        assert.equal(res.status, 401);
    });

    test("Bearer with nothing after it gives 401", async () => {
        const res = await fetch(`${BASE_URL}/api/launches`, {
            method: "POST",
            headers: { Authorization: "Bearer", "Content-Type": "application/json" },
            body: "{}",
        });
        assert.equal(res.status, 401);
    });
});
