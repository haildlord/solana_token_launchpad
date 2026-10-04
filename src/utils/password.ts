// bcryptjs is plain JavaScript and slow on purpose. On Workers that burns a lot of CPU time
// (the free plan allows about 10ms per request). PBKDF2 from Web Crypto does the same job
// (a slow, salted password hash) in native code.
//
// Stored format: pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>

const ITERATIONS = 100_000; // the highest value Workers allow
const encoder = new TextEncoder();

function toBase64(bytes : Uint8Array) : string {
    return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text : string) : Uint8Array {
    return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

async function derive(password : string, salt : Uint8Array, iterations : number) : Promise<Uint8Array> {
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return new Uint8Array(bits);
}

export async function hashPassword(password : string) : Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt, ITERATIONS);
    return `pbkdf2_sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password : string, stored : string) : Promise<boolean> {
    const [scheme, iterations, salt, hash] = stored.split("$");
    if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !hash) return false;

    const expected = fromBase64(hash);
    const actual = await derive(password, fromBase64(salt), Number(iterations));
    if (actual.length !== expected.length) return false;

    // compare every byte so the time taken does not leak how many bytes matched
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
    return diff === 0;
}
