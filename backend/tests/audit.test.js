import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, setupProductChain, pool } from "./helpers.js";

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

test("mutations are audited; GET /api/audit as manager returns entries", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 1 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Audit Co", productId, quantity: 5 } })
  ).body;

  const res = await api("GET", "/api/audit", { token: manager });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0, "audit log should have entries after mutations");

  const createEntry = res.body.find(
    (e) => e.action === "work_order.create" && e.entityId === order.id
  );
  assert.ok(createEntry, "work_order.create should be recorded with the order id");
  assert.equal(createEntry.username, "manager", "audit entry should attribute the acting user");
});

test("GET /api/audit as operator -> 403", async () => {
  const { status } = await api("GET", "/api/audit", { token: operator });
  assert.equal(status, 403);
});

test("GET /api/audit with no token -> 401", async () => {
  const { status } = await api("GET", "/api/audit");
  assert.equal(status, 401);
});
