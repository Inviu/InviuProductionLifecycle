# FlowForge Roadmap

Target: a shop-floor production tracker that operators use on phones/tablets on
the floor, and managers use on desktop. Phases are ordered so each one leaves a
working system, and the mobile app comes only after the backend is trustworthy.

---

## Phase 0 — Make it runnable ✅ (this branch)

- `.gitignore`, `.env.example` (backend + frontend), `docker-compose.yml` for local Postgres.
- Switched DB driver from Neon-only (`neon-http`) to standard `node-postgres`
  (`pg`). Works against local Postgres **and** Neon, and supports transactions
  (needed in Phase 1).
- `npm run seed` — idempotent seed: 2 products, ordered process chains,
  machines, mappings, inventory.
- `npm run migrate` script; fixed `npm start` path.
- Bug fixes: processes now returned in sequence; work-orders list joins the
  product name (fixes blank "Product Type" column + product filter); inventory
  call no longer hardcodes `localhost:5001`; removed dead `getProgress` route
  and unused state; removed unused deps (`mysql2`, `@supabase/supabase-js`);
  fixed stale Vite proxy port.

## Phase 1 — Trustworthy backend ✅

- **Real authentication** with roles: **Manager** (create orders, assign
  machines, master data) and **Operator** (record completions).
- **Master-data APIs** for products, processes (explicit per-product sequence
  column), machines, mappings, inventory — so nobody edits the DB by hand.
- **Move business rules to the server**: step locking, the cascade between
  steps, and order status (`Pending → In Progress → Completed`) become server
  logic instead of being computed in the browser and trusted on save.
- **Transactions** around order updates so inventory can't drift on partial
  failure (now possible with the `pg` driver).
- Input validation on every endpoint.

## Phase 2 — Split users by device ✅

| User | Device | Does |
|---|---|---|
| Manager / planner | Web (desktop) | Create orders, assign machines, dashboard, master data |
| Floor operator | Phone / tablet | See the shop-floor queue, record completed units |

- Operator queue API (`/api/operator/queue`) and a role-based landing: operators
  go straight to the mobile queue, managers to the orders dashboard.

## Phase 3 — Operator app (PWA first) ✅

- Mobile-first operator screens (`OperatorPage`) in the same React codebase.
- Installable PWA: manifest + icons + service worker (vite-plugin-pwa);
  home-screen icon, full-screen, app shell cached for offline load.
- QR codes on machines → scan opens that machine's queue: **deferred** (optional;
  the queue already supports a `?machineId=` filter the scan would use).
- Native (React Native/Expo): not needed; the PWA covers offline + install.

## Phase 4 — Production polish & shop-floor hardening ✅ (code & config)

- **Offline resilience**: operator completions queue in localStorage during
  Wi-Fi drops and sync automatically on reconnect; actions the server can no
  longer apply surface as reviewable "failed" items (conflict handling).
- **Concurrency-safe**: completions run in a transaction with row locks, so
  parallel completions can't oversell inventory.
- Security: `helmet` headers, login rate-limiting; JWT secret required in prod.
- Audit log: who did what, when (`/api/audit`).
- Reports: production summary endpoint + manager dashboard (`/api/reports/summary`).
- Health checks: `/api/health` (liveness) and `/api/health/db` (DB readiness).
- Request logging via `morgan`.
- **Deploy config provided** (actual deploy needs your accounts): `render.yaml`
  blueprint (Postgres + backend + static frontend), backend `Dockerfile`,
  frontend `vercel.json`. Works with Neon or any managed Postgres.

### Still open (future)
- QR machine scanning; push notifications for new/urgent work.
- Alerting on stalled orders; richer reporting/throughput charts.
- Error monitoring (e.g. Sentry) wired to the central error handler.
