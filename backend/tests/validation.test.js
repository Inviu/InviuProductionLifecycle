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

function assertValidationError(res) {
  assert.equal(res.status, 400, `expected 400, got ${res.status}`);
  assert.equal(res.body.error, "Validation failed");
  assert.ok(Array.isArray(res.body.details), "validation error should carry a details array");
  assert.ok(res.body.details.length > 0);
  assert.ok("path" in res.body.details[0] && "message" in res.body.details[0]);
}

test("login: missing fields -> 400 validation shape", async () => {
  assertValidationError(await api("POST", "/api/auth/login", { body: {} }));
  assertValidationError(await api("POST", "/api/auth/login", { body: { username: "manager" } }));
  assertValidationError(await api("POST", "/api/auth/login", { body: { username: "", password: "" } }));
});

test("create order: missing/empty required fields -> 400 validation shape", async () => {
  assertValidationError(await api("POST", "/api/work-orders", { token: manager, body: {} }));
  assertValidationError(
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "", productId: 1, quantity: 5 } })
  );
  // quantity must be a positive integer
  assertValidationError(
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "X", productId: 1, quantity: 0 } })
  );
  assertValidationError(
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "X", productId: 1, quantity: -3 } })
  );
});

test("create order: wrong types -> 400 validation shape", async () => {
  assertValidationError(
    await api("POST", "/api/work-orders", {
      token: manager,
      body: { customerName: "X", productId: "not-a-number", quantity: "lots" },
    })
  );
});

test("assign: wrong/empty required fields -> 400 validation shape", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "X", productId, quantity: 5 } })
  ).body;
  // assignedQuantity must be a positive int
  assertValidationError(
    await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/assign`, {
      token: manager,
      body: { machines: [{ machineId: 1, assignedQuantity: 0 }] },
    })
  );
  // machineId must be a positive int
  assertValidationError(
    await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/assign`, {
      token: manager,
      body: { machines: [{ machineId: "x", assignedQuantity: 2 }] },
    })
  );
});

test("complete: missing/invalid quantity -> 400 validation shape", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "X", productId, quantity: 5 } })
  ).body;
  assertValidationError(
    await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, { token: manager, body: {} })
  );
  assertValidationError(
    await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
      token: manager,
      body: { quantity: 0 },
    })
  );
  assertValidationError(
    await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
      token: manager,
      body: { quantity: "five" },
    })
  );
});

test("product create: missing name -> 400 validation shape", async () => {
  assertValidationError(await api("POST", "/api/products", { token: manager, body: {} }));
  assertValidationError(await api("POST", "/api/products", { token: manager, body: { name: "" } }));
});
