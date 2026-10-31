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

## Phase 1 — Trustworthy backend (foundation for any app)

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

## Phase 2 — Split users by device

| User | Device | Does |
|---|---|---|
| Manager / planner | Web (desktop) | Create orders, assign machines, dashboards, master data |
| Floor operator | Phone / tablet | See their machine's queue, record completed units, flag issues |

- Operator-focused API views (my-machine queue, record completion).

## Phase 3 — Operator app (PWA first)

- Mobile-first operator screens in the same React codebase.
- Installable PWA: home-screen icon, full-screen, Android + iOS.
- Optional QR codes on machines → scan opens that machine's queue.
- Go native (React Native/Expo) only if PWA falls short on offline use,
  push notifications, or hardware access.

## Phase 4 — Production polish & shop-floor hardening

Done once the full package is correct and fail-safe.

- **Offline resilience**: operators keep recording during Wi-Fi drops; actions
  queue locally and sync on reconnect, with conflict handling.
- Deploy: frontend (Vercel), backend (Render/Railway), DB (Neon/managed PG).
- Audit log: who completed what, when, on which machine.
- Reports & dashboards; alerting on stalled orders.
- Health checks, structured logging, error monitoring.
