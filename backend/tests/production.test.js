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
  // product with 1 process + 1 machine mapped + inventory
  chain = await setupProductChain(base, manager, { processCount: 1 });
});

after(async () => {
  await stopServer(server);
  await pool.end();
});

function validEntry(overrides = {}) {
  return {
    productId: chain.productId,
    processId: chain.processIds[0],
    machineId: chain.machineIds[0],
    workerName: "Ravi",
    shiftStartTime: "09:00",
    shiftEndTime: "17:00",
    unitsProduced: 42,
    ...overrides,
  };
}

test("operator can log a production entry", async () => {
  const { status, body } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry(),
  });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.equal(body.unitsProduced, 42);
  assert.equal(body.workerName, "Ravi");
  assert.equal(body.machineId, chain.machineIds[0]);
});

test("manager can log a production entry too", async () => {
  const { status } = await api("POST", "/api/production-entries", {
    token: manager,
    body: validEntry({ unitsProduced: 7 }),
  });
  assert.equal(status, 201);
});

test("entry with no machine is allowed (machine-less process)", async () => {
  const { status, body } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ machineId: null }),
  });
  assert.equal(status, 201);
  assert.equal(body.machineId, null);
});

test("workerName defaults to the logged-in user when omitted", async () => {
  const { status, body } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ workerName: undefined }),
  });
  assert.equal(status, 201);
  assert.equal(body.workerName, "operator");
});

test("issue reasons round-trip as an array in the list", async () => {
  const reasons = ["Machine jam", "Material shortage"];
  const created = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ productionIssueReason: reasons, unitsProduced: 5 }),
  });
  assert.equal(created.status, 201);

  const list = await api("GET", `/api/production-entries?productId=${chain.productId}`, {
    token: manager,
  });
  assert.equal(list.status, 200);
  const match = list.body.find((r) => r.id === created.body.id);
  assert.ok(match, "created entry should appear in the list");
  assert.deepEqual(match.productionIssueReasons, reasons);
  assert.equal(match.productName, match.productName); // name joined in
  assert.ok(match.processName);
});

test("rejects a machine not mapped to the process", async () => {
  // a machine from a brand-new process, not mapped to chain's process
  const other = await setupProductChain(base, manager, { processCount: 1 });
  const { status } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ machineId: other.machineIds[0] }),
  });
  assert.equal(status, 400);
});

test("rejects unknown product / process", async () => {
  const r1 = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ productId: 999999 }),
  });
  assert.equal(r1.status, 400);
  const r2 = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ processId: 999999, machineId: null }),
  });
  assert.equal(r2.status, 400);
});

test("rejects a bad time format with 400 (not 500)", async () => {
  const { status } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ shiftStartTime: "9am" }),
  });
  assert.equal(status, 400);
});

test("rejects a missing required field with 400", async () => {
  const { status } = await api("POST", "/api/production-entries", {
    token: operator,
    body: validEntry({ unitsProduced: undefined }),
  });
  assert.equal(status, 400);
});

test("requires authentication", async () => {
  const { status } = await api("POST", "/api/production-entries", {
    body: validEntry(),
  });
  assert.equal(status, 401);
});

test("operator can read the production list", async () => {
  const { status, body } = await api("GET", "/api/production-entries", { token: operator });
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
});
