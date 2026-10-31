// These tests document CONFIRMED backend bugs. Each asserts the correct
// contract (bad input / conflicting state should yield a clean 4xx, never a
// 500 "Internal server error"). They are EXPECTED TO FAIL against the current
// code until the bugs are fixed. See the QA report for root-cause analysis.
//
// Run just these with:  node --test tests/bugs.test.js

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, setupProductChain, uniq, pool } from "./helpers.js";

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

function assertClientError(res, label) {
  assert.ok(
    res.status >= 400 && res.status < 500,
    `${label}: expected a clean client error (4xx), got ${res.status} ${JSON.stringify(res.body)}`
  );
}

// BUG 1: updateWorkOrderSchema (validators.js) validates dueDate only as
// z.string().nullable().optional() with no .datetime() check. An invalid date
// string passes validation and reaches new Date(dueDate) in
// updateWorkOrderHeader (workOrder.service.js), producing an Invalid Date that
// Drizzle's timestamp mapper rejects with RangeError -> unhandled 500.
test("BUG: PUT /api/work-orders/:id with invalid dueDate should be 400, not 500", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 1 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "C", productId, quantity: 5 } })
  ).body;

  const res = await api("PUT", `/api/work-orders/${order.id}`, {
    token: manager,
    body: { dueDate: "not-a-real-date" },
  });
  assertClientError(res, "invalid dueDate on update");
});

// BUG 2: ordersTable.productId references productsTable.id with no onDelete
// policy, and DELETE /api/products/:id (master.routes.js) does not guard
// against existing references. Deleting a product that a work order points to
// raises a Postgres FK violation (23503) -> unhandled 500. Should be 409.
test("BUG: DELETE /api/products/:id referenced by a work order should be 409, not 500", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 1 });
  await api("POST", "/api/work-orders", { token: manager, body: { customerName: "C", productId, quantity: 5 } });

  const res = await api("DELETE", `/api/products/${productId}`, { token: manager });
  assertClientError(res, "delete referenced product");
});

// BUG 3: PUT /api/products/:id/processes (master.routes.js) inserts rows into
// product_process_mapping without verifying the processId exists. A bad
// processId triggers an FK violation inside the transaction -> unhandled 500.
// Should be a 400/404 validation/not-found error.
test("BUG: PUT /api/products/:id/processes with a non-existent processId should be 4xx, not 500", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: uniq("prod") } })).body;
  const res = await api("PUT", `/api/products/${product.id}/processes`, {
    token: manager,
    body: { processes: [{ processId: 987654, sequence: 1 }] },
  });
  assertClientError(res, "chain with non-existent process");
});
