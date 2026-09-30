import pg from "pg";

export const db = new pg.Client({
    host :'localhost',
    port : 5432,
    user : 'postgres',
    password : process.env.DB_PASSWORD,
    database : 'token_launchpad'
});

db.connect();

await db.query(`create table if not exists "user" (
    email text serial unique not null,
    name  varchar(20) not null,
    password text not null    
    )`
);