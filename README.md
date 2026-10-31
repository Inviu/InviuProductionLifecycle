# FlowForge

> End-to-end manufacturing work order orchestration — from raw material intake to sequential process completion.

---

## What is FlowForge?

FlowForge is a manufacturing operations platform designed to manage the full lifecycle of work orders across sequential production processes. It provides structured control over machine allocation, inventory consumption, and process-level completion — ensuring nothing moves forward until upstream steps are validated.

The core philosophy is simple: **a unit cannot enter a process until the previous process has completed it.**

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                   Client                     │
│  React + Tailwind CSS + Lucide Icons         │
│  ├── WorkOrderPage       (create / update)   │
│  ├── ProcessCard         (assignment & inv)  │
│  └── AppContext          (global state)      │
└────────────────────┬─────────────────────────┘
                     │ REST API
┌────────────────────▼─────────────────────────┐
│                   Server                     │
│  Express.js                                  │
│  ├── Work Order CRUD                         │
│  ├── Process & Machine Resolution            │
│  ├── Inventory Management                    │
│  └── Cron Jobs (scheduled tasks)             │
└────────────────────┬─────────────────────────┘
                     │ Drizzle ORM
┌────────────────────▼─────────────────────────┐
│               PostgreSQL                     │
│  ├── products                                │
│  ├── processes                               │
│  ├── machines                                │
│  ├── orders                                  │
│  ├── order_processes                         │
│  ├── order_process_machines                  │
│  └── product_process_inventory               │
└──────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 18 |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Runtime | Node.js 18+ |
| Server | Express.js |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Scheduling | Node-Cron |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL — local (Docker) or a cloud provider such as Neon
- npm

> **Auth is a demo stub.** Any username/password logs in. Real
> authentication is Phase 1 — see [ROADMAP.md](./ROADMAP.md).

### Installation

```bash
git clone https://github.com/Inviu/InviuProductionLifecycle.git
cd InviuProductionLifecycle
```

**1. Start a database**

Local (Docker) — easiest:

```bash
docker compose up -d   # Postgres 16 on localhost:5432 (user/pass/db: flowforge)
```

Or use a cloud Postgres (e.g. Neon) and copy its connection string.

**2. Backend**

```bash
cd backend
npm install
cp .env.example .env    # set DATABASE_URL (the .env.example default matches docker compose)
npm run migrate         # create the tables
npm run seed            # load sample products, processes, machines, inventory
npm run dev             # starts on http://localhost:5001
```

Check it: `curl http://localhost:5001/api/health` → `{"status":"true"}`

**3. Frontend**

```bash
cd frontend
npm install
npm run dev             # starts on http://localhost:5173
```

Open http://localhost:5173 and log in with a seeded account (below).

### Accounts & roles

`npm run seed` creates two users:

| Role | Login | Can do |
|------|-------|--------|
| Manager | `manager` / `manager123` | Everything: create orders, assign machines, master data, dashboard, audit |
| Operator | `operator` / `operator123` | Record completions from the mobile shop-floor queue |

Operators land on the mobile queue; managers land on the orders dashboard.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | Server listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `NODE_ENV` | `development` | Environment mode (`production` requires a real `JWT_SECRET`) |
| `JWT_SECRET` | `dev-secret-change-in-prod` | Secret used to sign JWTs — set a strong value in production |
| `JWT_EXPIRES_IN` | `12h` | Token lifetime |

---

## API Reference

All `/api` routes except `/api/health*` and `/api/auth/login` require a
`Authorization: Bearer <token>` header. Writes to master data require the
manager role; completions are allowed for managers and operators.

### Auth
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/login` | — | Log in → `{ token, user }` |
| `GET` | `/api/auth/me` | any | Current user |
| `GET` / `POST` | `/api/auth/users` | manager | List / create users |

### Work Orders (server-driven)
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/work-orders` | any | List orders (with product name + status) |
| `GET` | `/api/work-orders/:id` | any | Order detail with processes & machines |
| `POST` | `/api/work-orders` | manager | Create — server derives the process chain |
| `PUT` | `/api/work-orders/:id` | manager | Update header (customer, due date) |
| `POST` | `/api/work-orders/:id/processes/:processId/assign` | manager | Set machine assignments |
| `POST` | `/api/work-orders/:id/processes/:processId/complete` | floor | Complete units (consumes inventory, cascades) |
| `DELETE` | `/api/work-orders/:id` | manager | Delete |

### Master data
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET/POST/PUT/DELETE` | `/api/products` `/api/products/:id` | manager (writes) | Products CRUD |
| `GET/PUT` | `/api/products/:id/processes` | manager (write) | Read/replace a product's ordered process chain |
| `GET/POST/PUT/DELETE` | `/api/processes` | manager (writes) | Processes CRUD |
| `GET/POST/PUT/DELETE` | `/api/machines` (`?processId=`) | manager (writes) | Machines CRUD + per-process filter |
| `GET/PUT` | `/api/inventory/product/:p/process/:pr` | manager (write) | Read/set inventory |
| `POST` | `/api/inventory/product/:p/process/:pr/adjust` | manager | Adjust by delta |

### Operator, reports, audit, health
| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `GET` | `/api/operator/queue` (`?machineId=`) | floor | Actionable shop-floor queue |
| `GET` | `/api/reports/summary` | manager | Order/unit summary for the dashboard |
| `GET` | `/api/audit` | manager | Recent audit entries |
| `GET` | `/api/health`, `/api/health/db` | — | Liveness / DB readiness |

---

## Deployment

Config is included; deploying needs your own accounts.

- **Render (one blueprint)**: `render.yaml` provisions Postgres + the backend
  web service (runs migrations on start) + the static frontend. In Render:
  New → Blueprint → point at this repo. After the first deploy, set the
  frontend's `VITE_API_URL` to the backend URL (and optionally the backend's
  `API_URL` to its own URL to keep the free tier warm).
- **Docker**: `backend/Dockerfile` builds and runs the API (migrate + start).
- **Vercel (frontend)**: `frontend/vercel.json` (Vite + SPA rewrites); set
  `VITE_API_URL` to your backend.
- **Database**: Neon or any managed Postgres — set `DATABASE_URL`. The driver
  auto-enables SSL for `neon.tech`/`sslmode=require`.

The operator view is an installable PWA — on a phone, "Add to Home Screen"
gives a full-screen app whose shell loads offline; completions recorded offline
sync automatically when the connection returns.

---

## Seeding Test Data

```bash
cd backend
npm run seed
```

This loads two products, each with an ordered process chain (e.g. Cutting →
Plating → Chaffing → Quality Check), machines per process with their mappings,
and starting inventory, plus the two demo users. It is idempotent — it skips
seeding if users/products already exist. (Managers can also create and edit
products, processes, machines and inventory through the API / UI.)

---

## Key Design Decisions

- **Sequential locking** — Downstream processes remain locked until upstream completion is non-zero. This prevents out-of-order production entries.
- **Inventory as a gate** — Completion is not assumed; it must be backed by actual inventory availability, verified at the time of expansion via a live API call.
- **Additive machine assignments** — New machine assignments are appended to existing ones rather than replacing them, preserving historical allocation data.
- **Payload-driven updates** — The PUT endpoint trusts the frontend payload for `availableQuantity`, allowing the cascading unlock logic to flow naturally without requiring a separate re-calculation step on the server.


