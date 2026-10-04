# API tests

These tests call the running server over HTTP using Node's built in test runner.
No extra packages are needed.

## How to run

1. Make sure Postgres is running and `.env` is in the project root.
2. Start the server in one terminal:

       npm start

3. Run the tests in another terminal:

       npm test

To run one file:

    node --test tests/auth.test.js

To point at a server on another address:

    BASE_URL=http://localhost:4000 npm test

## Files

| File | What it covers |
| --- | --- |
| health.test.js | health check |
| auth.test.js | register, login, token checks |
| launches.test.js | create, get, list, filters, paging, status, update |
| whitelist.test.js | add, list and remove whitelist addresses |
| referrals.test.js | create and list referral codes |
| purchases.test.js | purchases, tiers, referral discount, limits, listing |
| vesting.test.js | vesting numbers with and without a schedule |
| helpers/client.js | request helper and small factory functions |

## Notes

- Every test creates its own users and launches with random emails and symbols,
  so the tests can be run again and again without clearing the database.
- Because of that, the test data stays in the database. Use a separate
  database if you do not want that.
- Numeric values are wrapped in `Number(...)` because Postgres NUMERIC can
  come back as a string.
