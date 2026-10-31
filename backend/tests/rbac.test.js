import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, uniq, setupProductChain, pool } from "./helpers.js";

let base, server, api, manager, operator;

before(async () => {
  ({ base, server } = await startServer());
  api = makeApi(base);
  ({ manager, operator } = await loginBoth(base));
});
after(async () => {
  await stopServer(server);
  await pool.end();
});

test("operator cannot POST /api/products -> 403", async () => {
  const { status, body } = await api("POST", "/api/products", { token: operator, body: { name: uniq("p") } });
  assert.equal(status, 403);
  assert.ok(body.error);
});

test("manager can POST /api/products -> 201", async () => {
  const { status, body } = await api("POST", "/api/products", { token: manager, body: { name: uniq("p") } });
  assert.equal(status, 201);
  assert.ok(body.id);
});

test("operator cannot POST /api/work-orders -> 403", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 1 });
  const { status } = await api("POST", "/api/work-orders", {
    token: operator,
    body: { customerName: "Acme", productId, quantity: 5 },
  });
  assert.equal(status, 403);
});

test("manager can POST /api/work-orders -> 201", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 1 });
  const { status, body } = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Acme", productId, quantity: 5 },
  });
  assert.equal(status, 201);
  assert.ok(body.id);
});

test("operator cannot list users (manager-only) -> 403", async () => {
  const { status } = await api("GET", "/api/auth/users", { token: operator });
  assert.equal(status, 403);
});

test("operator cannot delete a product -> 403", async () => {
  const prod = (await api("POST", "/api/products", { token: manager, body: { name: uniq("p") } })).body;
  const { status } = await api("DELETE", `/api/products/${prod.id}`, { token: operator });
  assert.equal(status, 403);
});

test("operator CAN complete a process (shop-floor role allowed)", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: 20 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 5 } })
  ).body;
  const { status } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: operator,
    body: { quantity: 2 },
  });
  assert.equal(status, 200);
});

test("operator cannot assign machines (manager-only) -> 403", async () => {
  const { productId, processIds, machineIds } = await setupProductChain(base, manager, { processCount: 1 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 5 } })
  ).body;
  const { status } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/assign`, {
    token: operator,
    body: { machines: [{ machineId: machineIds[0], assignedQuantity: 1 }] },
  });
  assert.equal(status, 403);
});
