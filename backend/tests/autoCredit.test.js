import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  startServer,
  stopServer,
  makeApi,
  loginBoth,
  setupProductChain,
  pool,
} from "./helpers.js";

let base, server, api, manager, operator, chain;

before(async () => {
  ({ base, server } = await startServer());
  api = makeApi(base);
  ({ manager, operator } = await loginBoth(base));
  chain = await setupProductChain(base, manager, { processCount: 2, inventory: 100 });
});

after(async () => {
  await stopServer(server);
  await pool.end();
});

test("a production log auto-credits the matching open work order", async () => {
  const created = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Auto", productId: chain.productId, quantity: 50 },
  });
  assert.equal(created.status, 201);
  const order = created.body;
  const firstProc = order.processes[0];
  assert.equal(firstProc.completedQuantity, 0);

  // Operator logs 20 good units of the first process via the shift log.
  const log = await api("POST", "/api/production-entries", {
    token: operator,
    body: {
      productId: chain.productId,
      processId: firstProc.processId,
      machineId: chain.machineIds[0],
      workerName: "Floor",
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      unitsProduced: 20,
    },
  });
  assert.equal(log.status, 201);
  assert.equal(log.body.creditedToOrder, order.id);

  // The order's first step advanced and the next step unlocked.
  const after = await api("GET", `/api/work-orders/${order.id}`, { token: manager });
  const fp = after.body.processes.find((p) => p.processId === firstProc.processId);
  const next = after.body.processes.find((p) => p.sequence === firstProc.sequence + 1);
  assert.equal(fp.completedQuantity, 20);
  assert.equal(next.availableQuantity, 20);
  assert.equal(next.status, "Ready");
  assert.equal(after.body.status, "In Progress");
});

test("logging more than remaining credits only up to the order quantity", async () => {
  // Fresh product so this is the only open order for it (auto-credit targets
  // the oldest open order, so a shared product would credit an earlier test's).
  const capChain = await setupProductChain(base, manager, { processCount: 2, inventory: 100 });
  const created = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Cap", productId: capChain.productId, quantity: 10 },
  });
  const order = created.body;
  const firstProc = order.processes[0];

  const log = await api("POST", "/api/production-entries", {
    token: operator,
    body: {
      productId: capChain.productId,
      processId: firstProc.processId,
      workerName: "Floor",
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      unitsProduced: 999, // way more than the order's 10
    },
  });
  assert.equal(log.status, 201);

  const after = await api("GET", `/api/work-orders/${order.id}`, { token: manager });
  const fp = after.body.processes.find((p) => p.processId === firstProc.processId);
  assert.equal(fp.completedQuantity, 10); // capped at the order quantity
  assert.equal(fp.status, "Completed");
});

test("a log with no open order for the product still saves (no crediting)", async () => {
  const other = await setupProductChain(base, manager, { processCount: 1 });
  const log = await api("POST", "/api/production-entries", {
    token: operator,
    body: {
      productId: other.productId,
      processId: other.processIds[0],
      workerName: "Floor",
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      unitsProduced: 15,
    },
  });
  assert.equal(log.status, 201);
  assert.equal(log.body.creditedToOrder, undefined);
});
