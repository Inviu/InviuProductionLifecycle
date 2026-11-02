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

test("completing a work-order step records a production entry with machine + issues", async () => {
  // Manager creates the order.
  const created = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Acme", productId: chain.productId, quantity: 20 },
  });
  assert.equal(created.status, 201);
  const order = created.body;
  const firstProc = order.processes[0];

  // Operator completes 8 units, naming the machine and an issue.
  const done = await api(
    "POST",
    `/api/work-orders/${order.id}/processes/${firstProc.processId}/complete`,
    {
      token: operator,
      body: {
        quantity: 8,
        machineId: chain.machineIds[0],
        productionIssueReason: ["Machine jam"],
      },
    }
  );
  assert.equal(done.status, 200);

  // A production entry should now exist for this product/process with 8 units.
  const list = await api("GET", `/api/production-entries?productId=${chain.productId}`, {
    token: manager,
  });
  assert.equal(list.status, 200);
  const match = list.body.find(
    (e) => e.processId === firstProc.processId && e.unitsProduced === 8
  );
  assert.ok(match, "a production entry should be created on completion");
  assert.equal(match.machineId, chain.machineIds[0]);
  assert.equal(match.workerName, "operator");
  assert.deepEqual(match.productionIssueReasons, ["Machine jam"]);
});

test("completion still works without machine or issues (plain quantity)", async () => {
  const created = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Beta", productId: chain.productId, quantity: 10 },
  });
  const order = created.body;
  const firstProc = order.processes[0];

  const done = await api(
    "POST",
    `/api/work-orders/${order.id}/processes/${firstProc.processId}/complete`,
    { token: operator, body: { quantity: 5 } }
  );
  assert.equal(done.status, 200);

  const list = await api("GET", "/api/production-entries", { token: manager });
  const match = list.body.find(
    (e) => e.processId === firstProc.processId && e.unitsProduced === 5
  );
  assert.ok(match);
  assert.equal(match.machineId, null);
});

test("rejects a machine not mapped to the process at completion", async () => {
  const created = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Gamma", productId: chain.productId, quantity: 10 },
  });
  const order = created.body;
  const firstProc = order.processes[0];
  // machineIds[1] is mapped to the *second* process, not the first.
  const done = await api(
    "POST",
    `/api/work-orders/${order.id}/processes/${firstProc.processId}/complete`,
    { token: operator, body: { quantity: 3, machineId: chain.machineIds[1] } }
  );
  assert.equal(done.status, 400);
});
