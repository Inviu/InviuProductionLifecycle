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

function bySeq(detail) {
  return [...detail.processes].sort((a, b) => a.sequence - b.sequence);
}

test("create work order derives chain from product mapping (first Ready, rest Locked, availableQuantity correct)", async () => {
  const { productId } = await setupProductChain(base, manager, { processCount: 3, inventory: 100 });
  const { status, body } = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Acme", productId, quantity: 25 },
  });
  assert.equal(status, 201);
  assert.equal(body.status, "Pending");
  const procs = bySeq(body);
  assert.equal(procs.length, 3);
  assert.equal(procs[0].status, "Ready");
  assert.equal(procs[0].availableQuantity, 25, "first process gets full order quantity");
  assert.equal(procs[0].completedQuantity, 0);
  for (let i = 1; i < procs.length; i++) {
    assert.equal(procs[i].status, "Locked", `process ${i} should be Locked`);
    assert.equal(procs[i].availableQuantity, 0, `process ${i} should start with 0 available`);
  }
});

test("create work order for product with no process chain -> 400", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: "nochain-" + Date.now() } })).body;
  const { status } = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Acme", productId: product.id, quantity: 5 },
  });
  assert.equal(status, 400);
});

test("create work order for a non-existent product -> 404", async () => {
  const { status } = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Acme", productId: 987654, quantity: 5 },
  });
  assert.equal(status, 404);
});

test("assign machines: within availableQuantity ok -> Assigned; over availableQuantity -> 400", async () => {
  const { productId, processIds, machineIds } = await setupProductChain(base, manager, { processCount: 2 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;

  const ok = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/assign`, {
    token: manager,
    body: { machines: [{ machineId: machineIds[0], assignedQuantity: 10 }] },
  });
  assert.equal(ok.status, 200);
  const p0 = ok.body.processes.find((p) => p.processId === processIds[0]);
  assert.equal(p0.status, "Assigned");
  assert.equal(p0.machines.length, 1);
  assert.equal(p0.machines[0].assignedQuantity, 10);

  const over = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/assign`, {
    token: manager,
    body: { machines: [{ machineId: machineIds[0], assignedQuantity: 11 }] },
  });
  assert.equal(over.status, 400, "assigning beyond availableQuantity must be rejected");
});

test("assign to a Locked process -> 409", async () => {
  const { productId, processIds, machineIds } = await setupProductChain(base, manager, { processCount: 2 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;
  const { status } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[1]}/assign`, {
    token: manager,
    body: { machines: [{ machineId: machineIds[1], assignedQuantity: 1 }] },
  });
  assert.equal(status, 409);
});

test("complete a process: inventory decrements, completedQuantity increases, next unlocks & inherits availableQuantity, order -> In Progress", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 2, inventory: 100 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 20 } })
  ).body;

  const invBefore = (await api("GET", `/api/inventory/product/${productId}/process/${processIds[0]}`, { token: manager })).body.availableQuantity;

  const res = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: manager,
    body: { quantity: 20 },
  });
  assert.equal(res.status, 200);
  const procs = bySeq(res.body);
  assert.equal(procs[0].status, "Completed");
  assert.equal(procs[0].completedQuantity, 20);
  assert.equal(procs[1].status, "Ready", "next process unlocks");
  assert.equal(procs[1].availableQuantity, 20, "next process inherits completed quantity");
  assert.equal(res.body.status, "In Progress");

  const invAfter = (await api("GET", `/api/inventory/product/${productId}/process/${processIds[0]}`, { token: manager })).body.availableQuantity;
  assert.equal(invAfter, invBefore - 20, "inventory must decrement by the completed quantity");
});

test("completing a Locked process -> 409", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 2 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;
  const { status } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[1]}/complete`, {
    token: manager,
    body: { quantity: 1 },
  });
  assert.equal(status, 409);
});

test("over-completing beyond remaining -> 400", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: 100 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;
  const { status, body } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: manager,
    body: { quantity: 11 },
  });
  assert.equal(status, 400);
  assert.match(body.error, /remain/i);
});

test("completing with insufficient inventory -> 400 (set inventory low first)", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: 100 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;
  // Drop inventory below what we try to complete.
  await api("PUT", `/api/inventory/product/${productId}/process/${processIds[0]}`, {
    token: manager,
    body: { availableQuantity: 2 },
  });
  const { status, body } = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: manager,
    body: { quantity: 5 },
  });
  assert.equal(status, 400);
  assert.match(body.error, /inventory/i);

  // inventory untouched after the failed completion
  const inv = (await api("GET", `/api/inventory/product/${productId}/process/${processIds[0]}`, { token: manager })).body.availableQuantity;
  assert.equal(inv, 2, "failed completion must not consume inventory");
});

test("full happy path: complete every process to 100% -> order Completed", async () => {
  const PROC = 4;
  const QTY = 15;
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: PROC, inventory: 100 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: QTY } })
  ).body;

  let lastStatus = null;
  for (let i = 0; i < PROC; i++) {
    const res = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[i]}/complete`, {
      token: operator,
      body: { quantity: QTY },
    });
    assert.equal(res.status, 200, `completing process ${i} should succeed`);
    lastStatus = res.body.status;
    const procs = res.body.processes.sort((a, b) => a.sequence - b.sequence);
    assert.equal(procs[i].status, "Completed");
    assert.equal(procs[i].completedQuantity, QTY);
  }
  assert.equal(lastStatus, "Completed", "order should be Completed after all processes done");

  const detail = await api("GET", `/api/work-orders/${order.id}`, { token: manager });
  assert.equal(detail.body.status, "Completed");
  assert.ok(detail.body.processes.every((p) => p.status === "Completed"));
});

test("partial completion then finish: order goes Pending -> In Progress -> Completed", async () => {
  const { productId, processIds } = await setupProductChain(base, manager, { processCount: 1, inventory: 100 });
  const order = (
    await api("POST", "/api/work-orders", { token: manager, body: { customerName: "Acme", productId, quantity: 10 } })
  ).body;
  assert.equal(order.status, "Pending");

  const r1 = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: operator,
    body: { quantity: 4 },
  });
  assert.equal(r1.body.status, "In Progress");

  const r2 = await api("POST", `/api/work-orders/${order.id}/processes/${processIds[0]}/complete`, {
    token: operator,
    body: { quantity: 6 },
  });
  assert.equal(r2.body.status, "Completed");
});

test("complete a process on a non-existent order -> 404", async () => {
  const { processIds } = await setupProductChain(base, manager, { processCount: 1 });
  const { status } = await api("POST", `/api/work-orders/987654/processes/${processIds[0]}/complete`, {
    token: manager,
    body: { quantity: 1 },
  });
  assert.equal(status, 404);
});
