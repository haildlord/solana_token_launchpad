import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BASE_URL, api, registerUser, createLaunch, launchBody } from "./helpers/client.js";

// a real 1x1 png
const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
);

function upload(launchId, token, { bytes = PNG, type = "image/png", name = "token.png", field = "image" } = {}) {
    const form = new FormData();
    if (bytes) form.append(field, new Blob([bytes], { type }), name);
    return fetch(`${BASE_URL}/api/launches/${launchId}/image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
    }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }));
}

describe("token image", () => {
    test("creator can upload an image and the launch keeps the link", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);

        const res = await upload(launch.id, owner.token);
        assert.equal(res.status, 200);
        assert.match(res.body.imageUrl, /^\/uploads\/.+\.png$/);
        assert.equal(res.body.status, "ACTIVE");

        const fetched = await api("GET", `/api/launches/${launch.id}`);
        assert.equal(fetched.body.imageUrl, res.body.imageUrl);
    });

    test("the saved file can be opened", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const { body } = await upload(launch.id, owner.token);

        const file = await fetch(BASE_URL + body.imageUrl);
        assert.equal(file.status, 200);
        assert.equal(file.headers.get("content-type"), "image/png");
    });

    test("uploading again replaces the image", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const first = await upload(launch.id, owner.token);
        const second = await upload(launch.id, owner.token);

        assert.notEqual(first.body.imageUrl, second.body.imageUrl);
        const old = await fetch(BASE_URL + first.body.imageUrl);
        assert.equal(old.status, 404);
    });

    test("a launch without an image has no imageUrl", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        assert.ok(!launch.imageUrl);
    });

    test("an image link can be sent when the launch is created", async () => {
        const owner = await registerUser("img_owner");
        const url = "https://example.com/logo.png";
        const launch = await createLaunch(owner.token, { imageUrl: url });
        assert.equal(launch.imageUrl, url);
    });

    test("an imageUrl that is not an http link is rejected", async () => {
        const owner = await registerUser("img_owner");
        const res = await api("POST", "/api/launches", {
            token: owner.token,
            body: launchBody({ imageUrl: "javascript:alert(1)" }),
        });
        assert.equal(res.status, 400);
    });

    test("another user gets 403", async () => {
        const owner = await registerUser("img_owner");
        const other = await registerUser("img_other");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, other.token);
        assert.equal(res.status, 403);
    });

    test("no token gives 401", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, undefined);
        assert.equal(res.status, 401);
    });

    test("unknown launch gives 404", async () => {
        const user = await registerUser("img_404");
        const res = await upload(99999999, user.token);
        assert.equal(res.status, 404);
    });

    test("a text file is rejected", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, owner.token, {
            bytes: Buffer.from("hello"),
            type: "text/plain",
            name: "a.txt",
        });
        assert.equal(res.status, 400);
    });

    test("a file bigger than 2MB is rejected", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, owner.token, { bytes: Buffer.alloc(3 * 1024 * 1024) });
        assert.equal(res.status, 400);
    });

    test("no file gives 400", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, owner.token, { bytes: null });
        assert.equal(res.status, 400);
    });

    test("wrong field name gives 400", async () => {
        const owner = await registerUser("img_owner");
        const launch = await createLaunch(owner.token);
        const res = await upload(launch.id, owner.token, { field: "picture" });
        assert.equal(res.status, 400);
    });
});
