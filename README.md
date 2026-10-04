# LordLaunch (v1_hono)

A token launchpad for Solana. Creators set up a token sale (price, supply, dates, whitelist, referral codes, tiered pricing, vesting). Buyers join the sale, and the platform keeps track of how much each person bought, what they paid, and how much of it they can claim over time.

This branch is the **Cloudflare version**. The Express + PostgreSQL backend from `main` was rewritten with **Hono** so it runs on **Cloudflare Workers**, with **D1** as the database and **Workers KV** for token images. One Worker serves both the API and the React frontend.

- **Backend:** Hono + TypeScript on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Images:** Cloudflare Workers KV
- **Frontend:** React single page app (Vite), served by the same Worker
- **Tests:** the same 197 HTTP tests as the Express version, all passing

> **Important:** this project is the *platform side* of a launchpad (accounts, sale rules, bookkeeping). It does not talk to the Solana blockchain. Buyers paste a transaction signature and the server records it, but does not check it on chain. See [What a production launchpad adds](#what-a-production-launchpad-adds).

---

## Table of contents

1. [Concepts I learned](#concepts-i-learned)
2. [Architecture](#architecture)
3. [Express vs Hono: what changed](#express-vs-hono-what-changed)
4. [Technology used](#technology-used)
5. [API reference](#api-reference)
6. [Database schema](#database-schema)
7. [Run it locally](#run-it-locally)
8. [Deploy to Cloudflare](#deploy-to-cloudflare)
9. [Running the tests](#running-the-tests)
10. [Project structure](#project-structure)
11. [What a production launchpad adds](#what-a-production-launchpad-adds)
12. [Talking points](#talking-points)

---

## Concepts I learned

### 1. What is a token launchpad?

A launchpad is a platform where new crypto projects sell their tokens to the public for the first time, usually before the token trades on an exchange. The platform handles the sale rules so the project and the buyers both know what to expect.

Typical names for this kind of sale: **ICO** (initial coin offering), **IDO** (initial DEX offering) and **IEO** (initial exchange offering). The difference is mostly *where* the sale happens. The mechanics below are the same.

Why projects use a launchpad:

- Reach buyers without building their own sale site
- Enforce fair rules (limits per person, allowlists, time windows)
- Spread token release over time, so early buyers cannot dump everything on day one

### 2. Solana basics that matter for a launchpad

| Term | Meaning |
| --- | --- |
| **SOL** | Solana's native coin. Used to pay for tokens and transaction fees. |
| **Lamport** | The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports. |
| **Wallet / public key** | A person's address on Solana (a base58 string). Phantom and Solflare are common wallets. |
| **SPL token** | A token made with Solana's Token Program. Most Solana tokens are SPL tokens. |
| **Mint** | The on chain account that defines one token: its supply, decimals and who may create more. |
| **Token account (ATA)** | An account that holds one wallet's balance of one token. A wallet needs one per token. |
| **Transaction signature** | A unique id for a transaction (a base58 string). Anyone can look it up on a block explorer. We store it as proof of payment and to block reuse. |
| **Devnet / mainnet** | Devnet is the free test network. Mainnet is the real one. |

### 3. Sale rules this project implements

**Sale window and computed status**

Every launch has `startsAt` and `endsAt`. The status is never stored. It is *computed* from the data each time, so it can never go out of date:

| Status | Rule |
| --- | --- |
| `SOLD_OUT` | tokens purchased >= total supply (checked first) |
| `UPCOMING` | now < startsAt |
| `ENDED` | now > endsAt |
| `ACTIVE` | between start and end, and not sold out |

Purchases are only accepted while the status is `ACTIVE`.

**Supply, price and limits**

- `totalSupply`: how many tokens are for sale. A purchase can never push the total sold above it.
- `pricePerToken`: the flat price in SOL.
- `maxPerWallet`: the most one *person* can buy. See Sybil protection below.

**Tiered pricing**

Early buyers get a cheaper price. Tiers are filled in order, and each tier has a capacity of `maxAmount - minAmount`. Anything left over after the last tier costs the flat `pricePerToken`.

```
tiers:  [0 - 100] at 1 SOL,  [100 - 200] at 2 SOL      flat price: 3 SOL

buy 250 tokens:
   100 x 1 =  100     (fills tier 1)
   100 x 2 =  200     (fills tier 2)
    50 x 3 =  150     (overflow at the flat price)
   total       450 SOL
```

**Referral codes**

The creator makes codes like `SAVE10` with a `discountPercent` and a `maxUses`. A buyer who enters the code gets that percentage taken off the total cost, and the code's `usedCount` goes up. When `usedCount >= maxUses` the code is dead. A failed purchase never uses up a code.

```
450 SOL with a 10% code  ->  405 SOL
```

**Whitelist (allowlist)**

If the creator adds any addresses, only those wallets may buy. If the list is empty, anyone may buy. Duplicate addresses are ignored.

**Sybil protection**

A *Sybil attack* is one person pretending to be many people (for example, using 50 wallets to get around a per-wallet limit). So `maxPerWallet` here is counted **per user account across all of their wallets**, not per wallet address. The server adds up everything the same `userId` bought in that launch.

**Duplicate transaction protection**

Each `txSignature` can be used once. Otherwise someone could record the same payment twice.

### 4. Vesting

Vesting means buyers do not get all their tokens at once. The release is spread over time, so the price is not crushed by everyone selling on day one.

The vocabulary:

| Term | Meaning |
| --- | --- |
| **TGE** (token generation event) | The moment tokens first become available. A percentage can be unlocked right away. |
| **TGE %** | The share of the purchase that is unlocked at TGE. |
| **Cliff** | A waiting period after which the linear release starts. Nothing from the linear part unlocks before the cliff ends. |
| **Linear vesting** | After the cliff, the rest unlocks a little every moment, evenly, until `vestingDays` have passed. |

The formulas used in `calculateVestingSchedule`:

```
tgeAmount       = floor(totalPurchased x tgePercent / 100)
cliffEndsAt     = launch.endsAt + cliffDays
remaining       = totalPurchased - tgeAmount

before the cliff:   linearVested = 0
after the cliff:    linearVested = remaining x (time since cliff / vestingDays)
                    (capped at `remaining` once vestingDays are over)

vestedAmount    = tgeAmount + linearVested
lockedAmount    = totalPurchased - vestedAmount
claimableAmount = vestedAmount
```

Worked example: someone buys 1000 tokens, with `tgePercent 10`, `cliffDays 30`, `vestingDays 100`.

| When | Vested | Locked |
| --- | --- | --- |
| Right after the sale | 100 (TGE) | 900 |
| Day 30 (cliff ends) | 100 | 900 |
| Day 80 (50 days into linear) | 100 + 450 = 550 | 450 |
| Day 130 | 1000 | 0 |

If a launch has no vesting config, everything is claimable immediately.

> This server only *calculates* what is claimable. Nothing is actually transferred. See the production section.

---

## Architecture

```
                      https://lordlaunch.<your-subdomain>.workers.dev
                                         |
                                Cloudflare edge network
                                         |
              +--------------------------+---------------------------+
              |                                                      |
     /api/*  and  /uploads/*                                every other path
              |                                                      |
              v                                                      v
   Worker (Hono app, src/index.ts)                    Static assets (frontend/dist)
              |                                       React app, index.html for unknown paths
              |  middleware: schema check, auth
              v
   Routes  ->  Services  ->  bindings
                               |
              +----------------+----------------+
              |                                 |
         env.DB  (D1, SQLite)             env.IMAGES  (Workers KV)
         users, launches, whitelists,     image bytes, key = random file name
         referrals, purchases
```

`wrangler.jsonc` wires this up:

- `assets` points at `frontend/dist`. `run_worker_first: ["/api/*", "/uploads/*"]` sends only those paths to the Worker. Everything else is served as a static file, and `not_found_handling: "single-page-application"` returns `index.html` for paths like `/launches/12`, so React Router can take over.
- `d1_databases` gives the Worker `env.DB`.
- `kv_namespaces` gives the Worker `env.IMAGES`.
- `JWT_SECRET` is a secret, set with `wrangler secret put`, never stored in the repo.

### Request lifecycle

Example: `POST /api/launches/12/purchase`

1. Cloudflare sees the path starts with `/api/`, so it runs the Worker instead of serving a file.
2. `schemaMiddleware` makes sure the tables exist (only does real work on the first request of each Worker instance).
3. Hono matches `/api/launches/:id/purchase`.
4. `authMiddleware` reads `Authorization: Bearer <token>`, verifies the JWT with `hono/jwt` and stores the user with `c.set("user", ...)`. A bad token becomes a `401`.
5. The handler loads the launch, checks it is `ACTIVE`, validates the body, checks the whitelist, supply, transaction signature, referral code and per user limit, then works out the price.
6. `recordPurchase` runs one **D1 batch**: insert the purchase, add to `totalPurchased`, bump the referral `usedCount`. A batch is a transaction, so either all three happen or none do.
7. The handler returns `201` with the purchase.
8. Anything thrown as an `AppError` reaches `app.onError`, which turns it into a JSON response with the right status code.

### Where is the token image stored?

| Part | Where |
| --- | --- |
| The image bytes | Workers KV (`env.IMAGES`), under a random key like `1d9cad46-....png`, with the content type saved as metadata |
| The link to it | the `imageUrl` column of the `launches` table, for example `/uploads/1d9cad46-....png` |

`GET /uploads/:key` in `src/index.ts` reads the bytes from KV and returns them with the right `Content-Type` and a long cache header (the names are random and never reused, so they can be cached forever).

Why KV and not R2? R2 is Cloudflare's real object storage and the better long term choice, but it has to be switched on in the dashboard with a payment method. KV works on the free plan with no setup, and a 2 MB logo fits easily. Moving to R2 later only touches `src/services/imageService.ts` and `wrangler.jsonc`.

Same rules as the Express version: creator only, png / jpg / webp / gif, 2 MB maximum, the server picks the name, replacing an image deletes the old one.

---

## Express vs Hono: what changed

The routes, rules, responses and status codes are the same. The test suite is the proof: the same 197 tests pass against both versions. What changed is everything that depended on Node.js or on a long running server.

| Topic | Express version (`main`) | Hono version (this branch) |
| --- | --- | --- |
| Runtime | Node.js process that stays running | Cloudflare Worker: starts per request, no server to manage, runs close to the user |
| Framework | `express.Router()`, `(req, res)` | `new Hono()`, one context `c` (`c.req`, `c.json`, `c.env`, `c.set/get`) |
| Request body | `express.json()` fills `req.body` | `readJson(c)` reads it, empty body means `{}`, broken JSON means `400` |
| Errors | error middleware `(err, req, res, next)` | `app.onError(errorHandler)` |
| Database | PostgreSQL via `pg` | D1 (SQLite) via the `env.DB` binding |
| Creating tables | on server start in `db.ts` | on the first request, `ensureSchema()` in `src/db/schema.ts` |
| Column names | Postgres lowercased them, `db.ts` mapped them back | SQLite keeps `creatorId` as written, no mapping needed |
| Numbers | `NUMERIC` came back as strings, needed a parser | `REAL` comes back as a number |
| Dates | `TIMESTAMPTZ` and `NOW()` | ISO text in UTC (sorts correctly as text), the current time is passed in as a parameter |
| JSON columns | `JSONB` | `TEXT`, parsed with `JSON.parse` when read |
| Whitelist bulk insert | `unnest($2::text[])` | `INSERT OR IGNORE ... VALUES (?, ?), (?, ?)` in groups of 50 (D1 allows 100 parameters per query) |
| Purchase write | 3 separate queries | 1 D1 batch, which is a transaction |
| Password hashing | `bcryptjs` | PBKDF2 from Web Crypto (`crypto.subtle`), native and fast enough for the Workers CPU limit |
| JWT | `jsonwebtoken` (needs Node crypto) | `hono/jwt` (Web Crypto) |
| File upload | `multer` writes to `./uploads` | `c.req.parseBody()` gives a `File`, bytes go to KV |
| Config and secrets | `.env` + `dotenv` | `wrangler.jsonc` bindings, `.dev.vars` locally, `wrangler secret put` in production |
| Frontend hosting | separate Vite server | same Worker, from `frontend/dist` |

---

## Technology used

### Backend

| Tool | What it is and why it is here |
| --- | --- |
| **Cloudflare Workers** | Serverless functions that run on Cloudflare's network in over 300 cities. No server to keep running, scales by itself, generous free tier. |
| **Hono** | Small, fast web framework built on web standards (`Request`, `Response`, `fetch`). Same code can run on Workers, Bun, Deno or Node. |
| **TypeScript** | JavaScript with types. `wrangler types` generates the types for the bindings (`env.DB`, `env.IMAGES`, `env.JWT_SECRET`). |
| **Wrangler** | Cloudflare's command line tool: local dev server, creating D1 / KV, setting secrets, deploying. |
| **D1** | Cloudflare's SQL database, based on SQLite. Queries use `?` placeholders, which prevents SQL injection. |
| **Workers KV** | Global key value store. Used here for image bytes. |
| **Web Crypto** | Built into the runtime. Used for password hashing (PBKDF2) and for signing JWTs. |
| **hono/jwt** | Signs and verifies the login tokens. |
| **HTTP / REST** | Each URL + method is one action. Status codes: `200` ok, `201` created, `400` bad input, `401` not logged in, `403` not allowed, `404` not found, `409` conflict. |

### Frontend

| Tool | What it is and why it is here |
| --- | --- |
| **React 19** | UI library. The screen is built from small components that re render when state changes. |
| **Vite** | Dev server and build tool. `npm run build` produces `frontend/dist`, which the Worker serves. |
| **React Router** | Client side routing: pages change without a full reload. |
| **Context API** | Shares the logged in user and toast messages across the app. |
| **Plain CSS** | One stylesheet with CSS variables. No UI library. |

### Testing

| Tool | What it is and why it is here |
| --- | --- |
| **node:test** | Test runner built into Node. No extra package. |
| **fetch** | The tests call the running Worker over HTTP, so routing, auth, validation and the database are tested together. |

---

## API reference

Routes marked **auth** need the header `Authorization: Bearer <token>`.

### Health and auth

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ "status": "ok" }` |
| POST | `/api/auth/register` | body `{ email, password, name }` -> `201 { token, user }`. `400` missing fields, `409` email taken |
| POST | `/api/auth/login` | body `{ email, password }` -> `200 { token, user }`. `401` wrong login |

### Launches

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/launches` | **auth**. body `{ name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers?, vesting?, imageUrl? }` |
| GET | `/api/launches` | public. `?page=1&limit=10&status=ACTIVE` -> `{ launches, total, page, limit }` |
| GET | `/api/launches/:id` | public. `404` if missing |
| PUT | `/api/launches/:id` | **auth**, creator only (`403` for others) |
| POST | `/api/launches/:id/image` | **auth**, creator only. `multipart/form-data` with a file in the field `image` |
| GET | `/uploads/:key` | public. The image itself |

### Whitelist and referrals (creator only)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/launches/:id/whitelist` | body `{ addresses: string[] }` (up to 1000 at a time) -> `{ added, total }` |
| GET | `/api/launches/:id/whitelist` | `{ addresses, total }` |
| DELETE | `/api/launches/:id/whitelist/:address` | `{ removed: true }` or `404` |
| POST | `/api/launches/:id/referrals` | body `{ code, discountPercent, maxUses }` -> `201`. `409` duplicate code |
| GET | `/api/launches/:id/referrals` | list with `usedCount` |

### Purchases and vesting

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/launches/:id/purchase` | **auth**. body `{ walletAddress, amount, txSignature, referralCode? }` -> `201` with `totalCost` |
| GET | `/api/launches/:id/purchases` | **auth**. The creator sees all purchases, everyone else sees only their own |
| GET | `/api/launches/:id/vesting?walletAddress=...` | **auth**. `{ totalPurchased, tgeAmount, cliffEndsAt, vestedAmount, lockedAmount, claimableAmount }` |

A purchase returns `400` when the launch is not `ACTIVE`, the wallet is not whitelisted, the user is over `maxPerWallet`, the amount is over the remaining supply, the `txSignature` was already used, or the referral code is invalid or used up.

---

## Database schema

The Worker creates the tables itself on the first request (`src/db/schema.ts`), so a brand new D1 database needs no migration step and starts empty.

```
users           id, email (unique), name, password (PBKDF2 hash)

launches        id, creatorId -> users, name, symbol (unique), description,
                totalSupply, totalPurchased, pricePerToken, startsAt, endsAt,
                maxPerWallet, tiers (JSON text), vesting (JSON text), imageUrl

whitelists      id, launchId -> launches, address          unique(address, launchId)

referrals       id, launchId -> launches, code, discountPercent, maxUses, usedCount
                                                            unique(launchId, code)

purchases       id, launchId -> launches, userId -> users, walletAddress, amount,
                totalCost, txSignature (unique)
```

Plus indexes on `whitelists(launchId)`, `purchases(launchId, userId)` and `purchases(launchId, walletAddress)`, the columns the purchase checks search by.

Dates are stored as ISO strings in UTC, for example `2026-10-04T10:00:00.000Z`. Because every value has the same format, comparing them as text gives the same answer as comparing them as times, which is how the status filter works in SQL.

---

## Run it locally

You do not need a Cloudflare account for this. `wrangler dev` runs the Worker on your machine with a local copy of D1 and KV (stored in `.wrangler/`), so nothing touches the real database.

### What you need

- **Git**
- **Node.js** 20.19 or newer (22+ recommended). Check with `node -v`

### Steps

```bash
# 1. get the code on this branch
git clone <your-github-repo-url>
cd solana_token_launchpad
git switch v1_hono

# 2. install (this also installs the frontend, through the postinstall script)
npm install

# 3. local secret for signing login tokens
cp .dev.vars.example .dev.vars

# 4. build the frontend and start the Worker
npm run dev
```

Open **http://localhost:3000**. That is the full app: the React pages and the API from one Worker, the same way it runs on Cloudflare.

For frontend work with instant reload, keep `npm run dev` running and in a second terminal run `cd frontend && npm run dev`, then open http://localhost:5173. Vite forwards `/api` and `/uploads` to port 3000.

---

## Deploy to Cloudflare

### One time setup

Already done for this project, listed so you know what exists and how to repeat it on another account:

```bash
npx wrangler login                                   # opens the browser to log in
npx wrangler d1 create lordlaunch-db                 # the database
npx wrangler kv namespace create lordlaunch-images   # the image store
```

Each `create` command prints an id. Those ids go into `wrangler.jsonc` under `d1_databases` and `kv_namespaces`. This branch already contains the ids of `lordlaunch-db` and `lordlaunch-images`.

### Deploy

```bash
# 1. make sure you are logged in to the right account
npx wrangler whoami

# 2. build the frontend and upload everything
npm run deploy
```

Wrangler prints the address, for example `https://lordlaunch.<your-subdomain>.workers.dev`.

```bash
# 3. set the secret that signs login tokens (do this once)
openssl rand -hex 32
npx wrangler secret put JWT_SECRET
```

Paste the random text from `openssl` when `wrangler secret put` asks for the value. Secrets apply right away, no redeploy needed.

### Check it

```bash
curl https://lordlaunch.<your-subdomain>.workers.dev/api/health
# {"status":"ok"}
```

Open the address in a browser, sign up, and create a launch. The first API request creates the tables. The database starts with no users and no launches.

### Updating later

Change the code, then `npm run deploy` again. The tables and data stay.

### Useful commands

```bash
npx wrangler tail                       # live logs from the deployed Worker
npx wrangler d1 execute lordlaunch-db --remote --command "SELECT id, email FROM users"
npx wrangler d1 execute lordlaunch-db --remote --command "SELECT COUNT(*) FROM launches"
```

### Common problems

| Problem | Fix |
| --- | --- |
| `{"success":false,"message":"JWT_SECRET is not set"}` | Run `npx wrangler secret put JWT_SECRET` (deploy step 3). |
| `The directory specified by the "assets.directory" field does not exist` | Build the frontend first: `npm run build` (`npm run deploy` and `npm run dev` already do it). |
| Error 1102 "Worker exceeded resource limits" on sign up or log in | The free plan allows about 10 ms of CPU per request and password hashing is slow on purpose. It fits in tests, but if this shows up, lower `ITERATIONS` in `src/utils/password.ts` or move to the Workers Paid plan. |
| Locally: `Address already in use` on port 3000 | Something else uses port 3000 (maybe the Express version). Stop it first. |
| `Please enable R2` | Not needed, this project uses KV for images. |

---

## Running the tests

The tests call a running server. Start the Worker locally (`npm run dev`), then in a second terminal:

```bash
npm test
```

197 tests cover: health, register and login, token checks, creating / listing / updating launches, status and filters, paging, whitelist, referrals, purchases (tiers, discounts, limits, Sybil rule, duplicates), vesting, and image upload.

They run against the **local** D1 database, so the deployed database is never touched. To run them against a deployed Worker instead (this fills its database with test data):

```bash
BASE_URL=https://lordlaunch.<your-subdomain>.workers.dev npm test
```

---

## Project structure

```
solana_token_launchpad/   (branch v1_hono)
├── src/                        the Worker
│   ├── index.ts                Hono app: mounts /api, serves /uploads, error handler
│   ├── types.ts                AppEnv: bindings + per request variables
│   ├── db/schema.ts            CREATE TABLE statements, run on first request
│   ├── routes/                 HTTP layer (auth, launches, health)
│   ├── services/               business rules and SQL, image storage
│   ├── middleware/             auth check, schema check, error handler
│   ├── utils/                  jwt, password hashing, body parsing, validators
│   ├── errors/AppError.ts      error type with an HTTP status
│   ├── interfaces/             TypeScript types
│   └── constants/              HTTP status codes
├── frontend/                   React app (built into frontend/dist)
├── tests/                      API tests (one file per area)
├── wrangler.jsonc              Worker config: assets, D1, KV, dev port
├── worker-configuration.d.ts   types generated by `npm run cf-typegen`
├── .dev.vars.example           template for local secrets
└── package.json
```

---

## What a production launchpad adds

This project covers the web platform. A real launchpad also needs the on chain part.

| This project | Production version |
| --- | --- |
| Buyer pastes a wallet address and a transaction signature | Buyer connects a wallet (Phantom, Solflare) and signs the payment transaction in the app |
| Server trusts the signature | Server (or a program) **verifies the transaction on chain**: right amount, right receiver, confirmed, not reused |
| Payment is just a number in the database | SOL goes to a **program-controlled account (PDA)** that holds the funds until the sale rules are met |
| "Claimable" is calculated | An on chain **vesting program** (written with Anchor, or a service like Streamflow) actually holds the tokens and releases them. Users **claim** with a transaction |
| Token is not created here | Creator mints an **SPL token**, and the sale program distributes it to buyers' token accounts |
| Whitelist is a table | Often a **Merkle tree** root stored on chain, so the program can check membership cheaply |
| Checks run, then the write runs | The supply and per user checks would run inside the same transaction as the write, so two buyers racing for the last tokens cannot oversell |
| Images in Workers KV | R2 object storage, or decentralised storage (IPFS/Arweave), plus token metadata (name, symbol, image) following the Metaplex standard |
| No soft or hard cap | **Soft cap** (minimum to raise, otherwise refund) and **hard cap** (maximum) |

---

## Talking points

**What is a launchpad?**
A platform that runs the first public sale of a token, with rules like time windows, limits per person, allowlists and vesting.

**What is vesting and why use it?**
Releasing tokens over time instead of all at once. It stops early buyers from dumping everything immediately. Parts: TGE unlock, a cliff, then linear release.

**What is a Sybil attack and how did you handle it?**
One person using many identities to get around limits. I count `maxPerWallet` per user account across all wallets, not per wallet address.

**Why is `status` computed instead of stored?**
It depends on the current time and on how much has sold. Computing it each time means it is always right without a background job.

**Why move from Express to Hono on Workers?**
No server to keep running or patch, it scales by itself, it runs close to users worldwide, and the free tier covers a project like this. Hono uses web standard `Request` and `Response`, so the code is not tied to Node.

**What was hard about the move?**
Anything that needed Node or a disk: `pg`, `bcryptjs`, `jsonwebtoken`, `multer` and the `uploads/` folder. They were replaced with D1, Web Crypto PBKDF2, `hono/jwt` and KV. SQL also changed from Postgres to SQLite (types, `NOW()`, `unnest`).

**How did you know the rewrite still works?**
The same 197 HTTP tests pass against both versions, because they only talk to the API over HTTP and do not care what runs behind it.

**Why is the image not in the database?**
Databases are for structured data. The bytes live in KV (R2 in a bigger setup) and the database keeps only the link.

**How do you stop SQL injection?**
All queries use `?` placeholders with `.bind(...)`, so user input is sent as data, never as part of the SQL text.

**How does login work?**
The password is checked against a PBKDF2 hash, then the Worker signs a JWT. The client sends it in the `Authorization` header and middleware verifies it on every protected route. There is no session storage.
