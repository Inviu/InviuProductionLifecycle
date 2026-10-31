# Backend integration tests

Automated integration suite that boots the real Express app (`createApp` from
`src/app.js`) on an ephemeral port and exercises it over HTTP with `fetch`,
using `node:test` + `node:assert`. No extra test frameworks.

## Prerequisites

- Node 22+
- A local PostgreSQL reachable at `postgresql://postgres@localhost:5432`
- `backend/.env` pointing `DATABASE_URL` at the **test** database
  (`flowforge_test`), e.g.:

  ```
  DATABASE_URL=postgresql://postgres@localhost:5432/flowforge_test
  PORT=5099
  NODE_ENV=test
  JWT_SECRET=test-secret
  ```

## Running

Reset + migrate + seed the test DB, then run the suite:

```bash
npm run test:reset   # drops & recreates flowforge_test, migrates, seeds users+master data
npm test             # node --test  (discovers tests/*.test.js)
```

`npm test` assumes the DB is already migrated and seeded (the two seeded users
`manager`/`operator` are required). The tests create their own master data with
unique names and key off returned ids, so the suite is safe to re-run without a
reset; run `npm run test:reset` when you want a pristine DB.

## Layout

- `helpers.js` – server bootstrap, HTTP helper, login, `setupProductChain`
- `auth.test.js` – login + JWT auth-guard behavior
- `rbac.test.js` – manager vs operator authorization
- `masterData.test.js` – products / processes / machines / chain / inventory
- `workOrderLifecycle.test.js` – order creation, assign, complete, status transitions
- `concurrency.test.js` – parallel completion fail-safe (transaction + row lock)
- `validation.test.js` – request-body validation error shape
- `audit.test.js` – audit log read + RBAC
- `notFound.test.js` – 404 behavior
- `bugs.test.js` – **expected-to-fail** tests documenting confirmed backend bugs
