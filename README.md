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

Open http://localhost:5173, log in with any credentials, and create a work order.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | Server listen port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `NODE_ENV` | `development` | Environment mode |

---

## API Reference

### Work Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/work-orders` | Fetch all work orders |
| `POST` | `/api/work-orders` | Create a new work order |
| `GET` | `/api/work-orders/:id` | Fetch a single work order with full process & machine details |
| `PUT` | `/api/work-orders/:id` | Update order — handles machine reassignment and inventory completion |

### Products & Processes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/getAllProducts` | List all products |
| `POST` | `/api/createProduct` | Create a product |
| `GET` | `/api/getprocess/:productId` | Fetch processes linked to a product |
| `GET` | `/api/getMachines/:processId` | Fetch machines available for a process |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory/product/:productId/process/:processId` | Current inventory level for a product at a given process stage |

---

## Seeding Test Data

```bash
cd backend
npm run seed
```

This loads two products, each with an ordered process chain (e.g. Cutting →
Plating → Chaffing → Quality Check), machines per process with their mappings,
and starting inventory. It is idempotent — it does nothing if products already
exist. There is no API to create products/processes/machines yet (Phase 1), so
`npm run seed` is currently the way to get a working dataset.

---

## Key Design Decisions

- **Sequential locking** — Downstream processes remain locked until upstream completion is non-zero. This prevents out-of-order production entries.
- **Inventory as a gate** — Completion is not assumed; it must be backed by actual inventory availability, verified at the time of expansion via a live API call.
- **Additive machine assignments** — New machine assignments are appended to existing ones rather than replacing them, preserving historical allocation data.
- **Payload-driven updates** — The PUT endpoint trusts the frontend payload for `availableQuantity`, allowing the cascading unlock logic to flow naturally without requiring a separate re-calculation step on the server.


