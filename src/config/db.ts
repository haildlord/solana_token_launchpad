import pg from "pg";

// Postgres returns NUMERIC as a string ("100"). Turn it into a real number so
// things like totalPurchased + amount do maths instead of joining strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value: string) => parseFloat(value));

// DATABASE_URL is used when it is set, otherwise we fall back to local postgres.
const client = new pg.Client(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host : 'localhost',
            port : 5432,
            user : 'postgres',
            password : process.env.DB_PASSWORD,
            database : 'token_launchpad'
        }
);

await client.connect();

// Postgres lowercases column names that are not quoted (creatorId -> creatorid),
// so rows come back as "creatorid". This puts the camelCase names back so the rest
// of the code can use launch.creatorId, launch.startsAt and so on.
const columnNames : Record<string, string> = {
    creatorid       : "creatorId",
    totalsupply     : "totalSupply",
    totalpurchased  : "totalPurchased",
    pricepertoken   : "pricePerToken",
    startsat        : "startsAt",
    endsat          : "endsAt",
    maxperwallet    : "maxPerWallet",
    launchid        : "launchId",
    discountpercent : "discountPercent",
    maxuses         : "maxUses",
    usedcount       : "usedCount",
    txsignature     : "txSignature",
    userid          : "userId",
    walletaddress   : "walletAddress",
    totalcost       : "totalCost",
    imageurl        : "imageUrl"
};

function fixColumnNames(row : any) : any {
    const fixed : any = {};
    for (const key of Object.keys(row)) {
        fixed[columnNames[key] ?? key] = row[key];
    }
    return fixed;
}

export const db = {
    async query<T extends pg.QueryResultRow = any>(text : string, values? : any[]) : Promise<pg.QueryResult<T>> {
        const result = await client.query<T>(text, values);
        result.rows = result.rows.map(fixColumnNames);
        return result;
    }
};

// "user" -> we used "user" cuz user is a reserved keyword in postgreSQL
await db.query(`create table if not exists "user" (
    id serial primary key,
    email text unique not null,
    name  text not null,
    password text not null    
    )`
);

await db.query(`create table if not exists launches(
    id serial primary key,
    creatorId integer REFERENCES "user"(id),
    name text not null,
    symbol text unique not null,
    totalSupply Numeric not null,
    totalPurchased Numeric default 0,
    pricePerToken NUMERIC not null,
    startsAt TIMESTAMPTZ not null,
    endsAt TIMESTAMPTZ not null,
    maxPerWallet numeric not null,
    description text not null,
    tiers JSONB,
    vesting JSONB
    )
`);

// The first version of the tables used varchar(10) and NUMERIC(5, 3), which made valid
// input (a long name, a price above 99.999) fail with a 500. These widen existing tables.
await db.query(`alter table "user" alter column name type text`);
await db.query(`alter table launches alter column name type text, alter column symbol type text, alter column pricePerToken type numeric`);

await db.query(`alter table launches add column if not exists imageUrl text`);

await db.query(`create table if not exists whitelists(
    id serial primary key,
    address text not null,
    launchId integer references launches(id),
    unique(address, launchId)
)`);

// * ON DELETE CASCADE is a rule on the foreign key. It tells Postgres: if a row in the parent table is deleted, automatically delete the child rows that point at it.
await db.query(`create table if not exists referrals(
    id serial primary key,
    launchId integer references launches(id) on delete cascade,
    code text not null,
    discountPercent numeric not null,
    maxUses integer not null,
    usedCount integer default 0,
    unique(launchId, code)
)`);

await db.query(`create table if not exists purchases(
    id serial primary key,
    launchId integer references launches(id) not null,
    txSignature text unique not null,
    userId integer references "user"(id),
    amount numeric not null default 0,
    walletAddress text not null,
    totalCost numeric not null,
    unique(launchId, userId, txSignature)
)`);
