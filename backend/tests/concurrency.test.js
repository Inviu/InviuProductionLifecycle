import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, setupProductChain, pool } from "./helpers.js";

let base, server, api, manager;

before(async () => {
  ({ base, server } = await startServer());
  api = makeApi(base);
  ({ manager } = await loginBoth(base));
});
after(async () => {
  await stopServer(server);
  await pool.end();
});

// Fire many concurrent completions whose combined quantity exceeds the
// available inventory. The transaction + SELECT ... FOR UPDATE row lock must
// serialize them so inventory never goes negative and no units are
// double-counted. This is the core fail-safe guarantee.
test("parallel completions never drive inventory negative (transaction + row lock)", async () => {
  const START_INV = 5;
  const PER_REQUEST = 2;
  const REQUESTS = 8; // combined demand 16 >> 5 available

  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: START_INV });
  // Large order quantity so the binding constraint is inventory, not remaining.
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Race", productId, quantity: 1000 } })
  ).body;

  const results = await Promise.all(
    Array.from({ length: REQUESTS }, () =>
      api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
        token: manager,
        body: { quantity: PER_REQUEST },
      })
    )
  );

  const successes = results.filter((r) => r.status === 200);
  const failures = results.filter((r) => r.status !== 200);

  // Every failure should be a clean 400 (insufficient inventory / remaining), not a 500.
  for (const f of failures) {
    assert.equal(f.status, 400, `expected clean 400 on contention, got ${f.status}: ${JSON.stringify(f.body)}`);
  }

  const consumed = successes.length * PER_REQUEST;
  assert.ok(consumed <= START_INV, `successful completions (${consumed}) must not exceed starting inventory (${START_INV})`);

  const invNow = (await api("GET", `/api/inventory/product/${productId}/process/${processIds[0]}`, { token: manager })).body.availableQuantity;
  assert.ok(invNow >= 0, `inventory must never be negative, got ${invNow}`);
  assert.equal(invNow, START_INV - consumed, "inventory decrement must exactly match successful completions (no lost/double writes)");

  // Completed quantity on the process must also match the consumed amount.
  const detail = (await api("GET", `/api/work-orders/${order.id}`, { token: manager })).body;
  const proc = detail.processes.find((p) => p.processId === processIds[0]);
  assert.equal(proc.completedQuantity, consumed, "completedQuantity must equal units actually completed");
});

// Same race on a single process whose binding constraint is the remaining
// order quantity (inventory abundant). completedQuantity must never exceed
// availableQuantity.
test("parallel completions never exceed the remaining order quantity", async () => {
  const QTY = 6;
  const PER = 2;
  const REQUESTS = 8;
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: 1000 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Race2", productId, quantity: QTY } })
  ).body;

  const results = await Promise.all(
    Array.from({ length: REQUESTS }, () =>
      api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
        token: manager,
        body: { quantity: PER },
      })
    )
  );
  const successes = results.filter((r) => r.status === 200).length;
  assert.ok(successes * PER <= QTY, `completed (${successes * PER}) must not exceed order quantity (${QTY})`);

  const detail = (await api("GET", `/api/work-orders/${order.id}`, { token: manager })).body;
  const proc = detail.processes.find((p) => p.processId === processIds[0]);
  assert.ok(proc.completedQuantity <= proc.availableQuantity, "completedQuantity must never exceed availableQuantity");
  assert.equal(proc.completedQuantity, successes * PER);
});
