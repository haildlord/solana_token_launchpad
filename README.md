# LordLaunch

A token launchpad for Solana. Creators set up a token sale (price, supply, dates, whitelist, referral codes, tiered pricing, vesting). Buyers join the sale, and the platform keeps track of how much each person bought, what they paid, and how much of it they can claim over time.

It is a full stack project:

- **Backend:** Node.js + Express + PostgreSQL REST API, written in TypeScript
- **Frontend:** React single page app (Vite)
- **Tests:** 197 HTTP tests using Node's built in test runner

> **Important:** this project is the *platform side* of a launchpad (accounts, sale rules, bookkeeping). It does not talk to the Solana blockchain. Buyers paste a transaction signature and the server records it, but does not check it on chain. See [What a production launchpad adds](#what-a-production-launchpad-adds).

---

## Table of contents

1. [Concepts I learned](#concepts-i-learned)
2. [Architecture](#architecture)
3. [Technology used](#technology-used)
4. [API reference](#api-reference)
5. [Database schema](#database-schema)
6. [How to run it (step by step)](#how-to-run-it-step-by-step)
7. [Running the tests](#running-the-tests)
8. [Project structure](#project-structure)
9. [What a production launchpad adds](#what-a-production-launchpad-adds)
10. [Talking points](#talking-points)

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
 Browser (React, port 5173)
        |
        |  fetch('/api/...')            Vite dev server forwards /api and /uploads
        v
 Express server (port 3000)
        |
        |   express.json  ->  routes  ->  middleware (auth, upload)  ->  handler
        v
   Routes layer       parse the request, check permissions, call services
        |
        v
   Services layer     business rules + SQL (launchService, userService)
        |
        v
   db.ts              one PostgreSQL connection, creates the tables on start
        |
        v
 PostgreSQL            users, launches, whitelists, referrals, purchases

 Uploaded images  ->  saved as files in ./uploads, the DB stores only the path
```

### Request lifecycle

Example: `POST /api/launches/12/purchase`

1. `express.json()` turns the JSON body into `req.body`.
2. The router matches `/api/launches/:id/purchase`.
3. `authMiddleware` reads `Authorization: Bearer <token>`, verifies the JWT and puts `{ id, email }` on `req`. A bad token becomes a `401`.
4. The handler loads the launch, checks it is `ACTIVE`, validates the body, checks the whitelist, supply, referral code, per user limit, then works out the price.
5. `recordPurchase` inserts the row, adds to `totalPurchased` and bumps the referral `usedCount`.
6. The handler answers `201` with the purchase.
7. If anything throws an `AppError`, the central `errorHandler` turns it into a JSON response with the right status code.

### Design decisions

- **Layers:** routes handle HTTP, services handle rules and SQL. This keeps handlers short and makes the logic easy to find.
- **`AppError` + central error handler:** any code can `throw new AppError(message, status)`. One place turns it into a response. Express 5 forwards errors from async handlers automatically.
- **Computed status:** derived from dates and totals, never stored, so there is no job needed to "flip" a launch to ENDED.
- **Validation in one file:** `src/utils/validators.ts` is used by create, update, whitelist and purchase routes.
- **Passwords:** hashed with bcrypt (10 rounds). The plain password is never stored or returned.
- **Auth:** stateless JWT, valid for 7 days. No session table needed.
- **Numbers:** PostgreSQL `NUMERIC` comes back as a string by default. `db.ts` registers a parser so they arrive as JavaScript numbers.
- **Column names:** PostgreSQL lowercases unquoted names (`creatorId` becomes `creatorid`). `db.ts` maps result columns back to camelCase.

### Where is the token image stored?

In two places, on purpose:

| Part | Where |
| --- | --- |
| The image file | the `uploads/` folder on the server, saved with a random name like `1d9cad46-....png` |
| The link to it | the `imageUrl` column of the `launches` table, for example `/uploads/1d9cad46-....png` |

Express serves the folder at `/uploads/...`, so the browser can load the image from that path.

Why not put the image *inside* the database? Image bytes make the database large and slow to back up, and the web server is much better at serving files. The usual production setup is object storage (S3, Cloudflare R2) with the same idea: the file lives in storage, the database keeps the link.

Rules enforced on upload: only the creator can upload; png, jpg, webp or gif only; 2 MB maximum; the server picks the file name (so nobody can overwrite another file); replacing an image deletes the old file.

The `uploads/` folder is in `.gitignore`, so images are **not** in the GitHub repo. A fresh clone starts with no images, and the app shows a coloured tile with the token symbol instead.

---

## Technology used

### Backend

| Tool | What it is and why it is here |
| --- | --- |
| **Node.js** | JavaScript runtime. Runs the server outside the browser. |
| **TypeScript** | JavaScript with types. Catches mistakes (a wrong field name, a missing value) before running. |
| **tsx** | Runs TypeScript files directly, so there is no build step to start the server. |
| **Express 5** | Web framework. Handles routing, middleware and JSON bodies on top of Node's `http` module. |
| **HTTP / REST** | The server speaks HTTP. Each URL + method (`GET /api/launches`) is one action, and status codes tell the result: `200` ok, `201` created, `400` bad input, `401` not logged in, `403` not allowed, `404` not found, `409` conflict. |
| **PostgreSQL** | Relational database. Good fit because the data has clear relations (a launch has many purchases) and money needs strict consistency. |
| **pg** | The PostgreSQL client for Node. Queries use `$1, $2` placeholders, which prevents SQL injection. |
| **JSON Web Token (jsonwebtoken)** | After login the server signs a token. The client sends it back on every request to prove who it is. |
| **bcryptjs** | Hashes passwords with a salt so a leaked database does not leak passwords. |
| **multer** | Reads `multipart/form-data` so the server can receive file uploads. |
| **dotenv** | Loads secrets from a `.env` file into `process.env`. |

### Frontend

| Tool | What it is and why it is here |
| --- | --- |
| **React 19** | UI library. The screen is built from small components that re render when state changes. |
| **Vite** | Dev server and build tool. Very fast reloads. Also proxies `/api` to the backend during development. |
| **React Router** | Client side routing: pages change without a full reload. |
| **Context API** | Shares the logged in user and toast messages across the app without passing props everywhere. |
| **Plain CSS** | One stylesheet with CSS variables. No UI library. |

### Testing

| Tool | What it is and why it is here |
| --- | --- |
| **node:test** | Test runner built into Node. No extra package. |
| **fetch** | The tests call the real running server over HTTP, so they test routing, auth, validation and the database together. |

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

### Whitelist and referrals (creator only)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/launches/:id/whitelist` | body `{ addresses: string[] }` -> `{ added, total }` |
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

The tables are created automatically when the server starts (`src/config/db.ts`).

```
"user"          id, email (unique), name, password (bcrypt hash)

launches        id, creatorId -> user, name, symbol (unique), totalSupply,
                totalPurchased, pricePerToken, startsAt, endsAt, maxPerWallet,
                description, imageUrl, tiers (JSONB), vesting (JSONB)

whitelists      id, launchId -> launches, address          unique(address, launchId)

referrals       id, launchId -> launches, code, discountPercent, maxUses, usedCount
                                                            unique(launchId, code)

purchases       id, launchId -> launches, userId -> user, walletAddress, amount,
                totalCost, txSignature (unique)
```

Notes:

- `tiers` and `vesting` are **JSONB** columns: flexible structured data stored inside one row. A good fit since they are always read together with the launch.
- `unique(...)` constraints are the last line of defence against duplicates, even if two requests arrive at the same moment.
- The user table is named `"user"` (quoted) because `user` is a reserved word in PostgreSQL.

---

## How to run it (step by step)

### What you need first

- **Git**
- **Node.js** 20.19 or newer (22+ recommended). Check with `node -v`
- **PostgreSQL** 14 or newer, running on your machine. Check with `psql --version`

### 1. Clone the project

```bash
git clone <your-github-repo-url>
cd solana_token_launchpad
```

### 2. Create the database

The server creates the *tables* itself, but the *database* must exist first. Open the PostgreSQL shell:

```bash
psql -U postgres
```

Then run:

```sql
CREATE DATABASE token_launchpad;
\q
```

(On macOS with Homebrew you can also run `createdb token_launchpad`.)

### 3. Create the `.env` file

Copy the example file and edit it:

```bash
cp .env.example .env
```

Open `.env` and fill it in:

```
# Your PostgreSQL password for the "postgres" user
DB_PASSWORD=your_password_here

# Any long random text. It signs the login tokens.
JWT_SECRET=change-me-to-a-long-random-string
```

Optional: instead of `DB_PASSWORD` you can give one full connection string. If `DATABASE_URL` is set it wins:

```
DATABASE_URL=postgresql://postgres:your_password_here@localhost:5432/token_launchpad
```

### 4. Install and start the backend

```bash
npm install
npm start
```

You should see `Server listening on... 3000`. On the first start it creates the tables. Check it:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

Leave this terminal running.

### 5. Install and start the frontend

Open a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### 6. Try it

1. Click **Sign up** and make an account.
2. Click **Create launch**, add an image, fill the form, and submit.
3. On the launch page, use the **Buy tokens** form. The wallet address and transaction signature can be any text for testing (the server does not check them on chain).
4. Open the **Manage** tab to add whitelist addresses or a referral code, then buy again to see them work.
5. Use the **Vesting** tab to look up a wallet.

### Common problems

| Problem | Fix |
| --- | --- |
| `ECONNREFUSED` in the Vite terminal, or "Cannot reach the server" in the browser | The backend is not running. Start it with `npm start` in the project root. |
| `password authentication failed for user "postgres"` | `DB_PASSWORD` in `.env` is wrong. |
| `database "token_launchpad" does not exist` | Do step 2. |
| `Port 3000 is already in use` | Another program is using port 3000. Stop it, or find it with `lsof -i :3000`. |
| Images are missing after cloning | Expected. Uploaded files are not in git. Upload them again. |

---

## Running the tests

The tests call a running server, so start the backend first (step 4), then in another terminal, from the project root:

```bash
npm test
```

197 tests cover: health, register and login, token checks, creating / listing / updating launches, status and filters, paging, whitelist, referrals, purchases (tiers, discounts, limits, Sybil rule, duplicates), vesting, and image upload.

Each test makes its own random users and launches, so the suite can run again and again. The side effect: **test data stays in the database**. Use a separate database if you do not want that.

---

## Project structure

```
solana_token_launchpad/
├── src/                        backend
│   ├── index.ts                starts Express, mounts routes, serves /uploads
│   ├── config/db.ts            PostgreSQL connection + table creation
│   ├── routes/                 HTTP layer (auth, launches, health)
│   ├── services/               business rules and SQL
│   ├── middleware/             auth check, error handler, image upload
│   ├── utils/                  jwt helpers, input validators
│   ├── errors/AppError.ts      error type with an HTTP status
│   ├── interfaces/             TypeScript types
│   └── constants/              HTTP status codes
├── tests/                      API tests (one file per area)
├── frontend/                   React app
│   └── src/
│       ├── pages/              Launches, LaunchDetail, CreateLaunch, auth pages
│       ├── components/         Navbar, LaunchRow, BuyPanel, ManagePanel, ...
│       ├── api.js              every call to the backend
│       ├── auth.jsx            login state (Context)
│       └── styles.css
├── uploads/                    saved token images (not in git)
├── .env.example                template for your .env
└── package.json
```

---

## What a production launchpad adds

This project covers the web platform. A real launchpad also needs the on chain part. Knowing the gap is part of understanding the topic.

| This project | Production version |
| --- | --- |
| Buyer pastes a wallet address and a transaction signature | Buyer connects a wallet (Phantom, Solflare) and signs the payment transaction in the app |
| Server trusts the signature | Server (or a program) **verifies the transaction on chain**: right amount, right receiver, confirmed, not reused |
| Payment is just a number in the database | SOL goes to a **program-controlled account (PDA)** that holds the funds until the sale rules are met |
| "Claimable" is calculated | An on chain **vesting program** (written with Anchor, or a service like Streamflow) actually holds the tokens and releases them. Users **claim** with a transaction |
| Token is not created here | Creator mints an **SPL token**, and the sale program distributes it to buyers' token accounts |
| Whitelist is a table | Often a **Merkle tree** root stored on chain, so the program can check membership cheaply |
| One database connection | Connection pool and database transactions, so two buyers racing for the last tokens cannot oversell |
| Local `uploads/` folder | Object storage (S3, R2) or decentralised storage (IPFS/Arweave), plus token metadata (name, symbol, image) following the Metaplex standard |
| No soft or hard cap | **Soft cap** (minimum to raise, otherwise refund) and **hard cap** (maximum) |

---

## Talking points

Short answers to questions you might be asked.

**What is a launchpad?**
A platform that runs the first public sale of a token, with rules like time windows, limits per person, allowlists and vesting.

**What is vesting and why use it?**
Releasing tokens over time instead of all at once. It stops early buyers from dumping everything immediately and shows the team is committed. Parts: TGE unlock, a cliff, then linear release.

**What is a cliff?**
A waiting period. Nothing from the linear schedule unlocks until the cliff ends, then unlocking starts.

**What is a Sybil attack and how did you handle it?**
One person using many identities to get around limits. I count `maxPerWallet` per user account across all wallets, not per wallet address.

**Why is `status` computed instead of stored?**
It depends on the current time and on how much has sold. Storing it would need a background job to keep it correct. Computing it each time is always right.

**How does login work?**
The password is checked with bcrypt, then the server signs a JWT. The client sends it in the `Authorization` header and middleware verifies it on every protected route. The server keeps no session.

**How do you stop SQL injection?**
All queries use parameter placeholders (`$1`), so user input is sent as data and never joined into the SQL text.

**Why PostgreSQL?**
The data is relational and involves money, so I want constraints (unique transaction signatures, foreign keys) enforced by the database itself.

**Where do the images go?**
The file is saved in `uploads/`, and the database stores only its path. Databases are for structured data, not for large files.

**Does it talk to Solana?**
Not yet. It records purchases and does the sale maths. The next step would be wallet connection and on chain verification of the payment (see the production table above).
