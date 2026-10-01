import pg from "pg";

export const db = new pg.Client({
    host :'localhost',
    port : 5432,
    user : 'postgres',
    password : process.env.DB_PASSWORD,
    database : 'token_launchpad'
});

db.connect();

// "user" -> we used "user" cuz user is a reserved keyword in postgreSQL
await db.query(`create table if not exists "user" (
    id serial primary key,
    email text unique not null,
    name  varchar(20) not null,
    password text not null    
    )`
);

// here creatorId will be converted to creatorid so if anyone wants to interact we need : "creatorId"
await db.query(`create table if not exists launches(
    id serial primary key,
    creatorId integer REFERENCES "user"(id),
    name varchar(10) not null,
    symbol varchar(10) unique not null,
    totalSupply Numeric not null,
    totalPurchased Numeric default 0,
    pricePerToken NUMERIC(5, 3) not null,
    startsAt TIMESTAMPTZ not null,
    endsAt TIMESTAMPTZ not null,
    maxPerWallet numeric not null,
    description text not null,
    tiers JSONB,
    vesting JSONB
    )
`);