// The Express version created its tables when the server started.
// A Worker has no "start", so we create them on the first request instead.
// IF NOT EXISTS makes this safe to run again and again.
//
// D1 is SQLite, so the types differ from the Postgres version:
//   serial      -> INTEGER PRIMARY KEY AUTOINCREMENT
//   numeric     -> REAL
//   timestamptz -> TEXT holding an ISO date in UTC ("2026-10-04T10:00:00.000Z"),
//                  which sorts correctly as text, so we can compare dates in SQL
//   jsonb       -> TEXT holding JSON
// SQLite keeps the column names as written, so creatorId stays creatorId.

const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS launches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creatorId INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        symbol TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        totalSupply REAL NOT NULL,
        totalPurchased REAL NOT NULL DEFAULT 0,
        pricePerToken REAL NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        maxPerWallet REAL NOT NULL,
        tiers TEXT,
        vesting TEXT,
        imageUrl TEXT
    )`,

    `CREATE TABLE IF NOT EXISTS whitelists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        launchId INTEGER NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        UNIQUE (address, launchId)
    )`,

    `CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        launchId INTEGER NOT NULL REFERENCES launches(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        discountPercent REAL NOT NULL,
        maxUses INTEGER NOT NULL,
        usedCount INTEGER NOT NULL DEFAULT 0,
        UNIQUE (launchId, code)
    )`,

    `CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        launchId INTEGER NOT NULL REFERENCES launches(id),
        userId INTEGER NOT NULL REFERENCES users(id),
        walletAddress TEXT NOT NULL,
        amount REAL NOT NULL,
        totalCost REAL NOT NULL,
        txSignature TEXT NOT NULL UNIQUE
    )`,

    `CREATE INDEX IF NOT EXISTS idx_whitelists_launch ON whitelists (launchId)`,
    `CREATE INDEX IF NOT EXISTS idx_purchases_launch_user ON purchases (launchId, userId)`,
    `CREATE INDEX IF NOT EXISTS idx_purchases_launch_wallet ON purchases (launchId, walletAddress)`,
];

// One Worker instance runs many requests, so we only do this once per instance.
let ready : Promise<unknown> | null = null;

export function ensureSchema(db : D1Database) : Promise<unknown> {
    if (!ready) {
        ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((err) => {
            ready = null; // try again on the next request
            throw err;
        });
    }
    return ready;
}
