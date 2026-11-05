import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, setupProductChain, pool, uniq } from "./helpers.js";

let server, api, manager, operator, chain;

before(async () => {
  let base;
  ({ base, server } = await startServer());
  api = makeApi(base);
  ({ manager, operator } = await loginBoth(base));
  chain = await setupProductChain(base, manager, { processCount: 2 });
});

after(async () => {
  await stopServer(server);
  await pool.end();
});

test("machine setup is manager-only", async () => {
  assert.equal((await api("GET", "/api/machine-setup", { token: operator })).status, 403);
});

test("add a machine with a number and name to a step; the app sees it", async () => {
  const code = uniq("DRX").slice(0, 40);
  const r = await api("POST", "/api/machine-setup/machines", {
    token: manager,
    body: { name: code, description: "Radial drill", processIds: [chain.processIds[0]] },
  });
  assert.equal(r.status, 201);
  const list = await api("GET", `/api/machines?processId=${chain.processIds[0]}`, { token: operator });
  const m = list.body.find((x) => x.id === r.body.id);
  assert.equal(m.name, code);
  assert.equal(m.description, "Radial drill");

  const ov = await api("GET", "/api/machine-setup", { token: manager });
  const row = ov.body.machines.find((x) => x.id === r.body.id);
  assert.deepEqual(row.processIds, [chain.processIds[0]]);
  assert.ok(ov.body.steps.find((s) => s.id === chain.processIds[0]).machineIds.includes(r.body.id));
});

test("rename and move a machine between steps", async () => {
  const r = await api("POST", "/api/machine-setup/machines", {
    token: manager,
    body: { name: uniq("MV").slice(0, 40), processIds: [chain.processIds[0]] },
  });
  const newName = uniq("MV2").slice(0, 40);
  const u = await api("PUT", `/api/machine-setup/machines/${r.body.id}`, {
    token: manager,
    body: { name: newName, description: "Moved", processIds: [chain.processIds[1]] },
  });
  assert.equal(u.status, 200);
  assert.equal(u.body.name, newName);
  const a = await api("GET", `/api/machines?processId=${chain.processIds[0]}`, { token: operator });
  const b = await api("GET", `/api/machines?processId=${chain.processIds[1]}`, { token: operator });
  assert.ok(!a.body.some((x) => x.id === r.body.id));
  assert.ok(b.body.some((x) => x.id === r.body.id));
});

test("duplicate machine numbers are refused (case-insensitive)", async () => {
  const code = uniq("DUP").slice(0, 40);
  assert.equal((await api("POST", "/api/machine-setup/machines", { token: manager, body: { name: code } })).status, 201);
  const d = await api("POST", "/api/machine-setup/machines", { token: manager, body: { name: code.toLowerCase() } });
  assert.equal(d.status, 409);
});

test("a machine with logs can't be deleted; an unused one can", async () => {
  const used = chain.machineIds[0];
  const log = await api("POST", "/api/production-entries", {
    token: operator,
    body: { productId: chain.productId, processId: chain.processIds[0], machineId: used, workerName: "T", shiftStartTime: "09:00", shiftEndTime: "10:00", unitsProduced: 5 },
  });
  assert.equal(log.status, 201);
  const del = await api("DELETE", `/api/machine-setup/machines/${used}`, { token: manager });
  assert.equal(del.status, 409);
  assert.match(del.body.error, /can't be deleted/);

  const spare = await api("POST", "/api/machine-setup/machines", { token: manager, body: { name: uniq("SP").slice(0, 40) } });
  assert.equal((await api("DELETE", `/api/machine-setup/machines/${spare.body.id}`, { token: manager })).status, 200);
});

test("unknown steps are refused", async () => {
  const r = await api("POST", "/api/machine-setup/machines", { token: manager, body: { name: uniq("X").slice(0, 40), processIds: [99999999] } });
  assert.equal(r.status, 400);
});
