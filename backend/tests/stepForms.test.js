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

const log = (body) =>
  api("POST", "/api/production-entries", {
    token: operator,
    body: {
      productId: chain.productId,
      processId: chain.processIds[0],
      workerName: "Floor",
      shiftStartTime: "09:00",
      shiftEndTime: "17:00",
      ...body,
    },
  });

test("inspection: good parts = inspected - rejections", async () => {
  const r = await log({ unitsInspected: 100, rejectedUnits: 7 });
  assert.equal(r.status, 201);
  assert.equal(r.body.unitsProduced, 93);
  assert.equal(r.body.rejectedUnits, 7);
  assert.equal(r.body.unitsInspected, 100);
});

test("inspection: rejections above inspected are refused", async () => {
  const r = await log({ unitsInspected: 10, rejectedUnits: 11 });
  assert.equal(r.status, 400);
});

test("breakdown window sets downtime minutes", async () => {
  const r = await log({
    unitsProduced: 400,
    breakdownStartTime: "10:00",
    breakdownEndTime: "10:45",
    downtimeReason: "Belt snapped",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.downtimeMinutes, 45);
  assert.equal(r.body.downtimeReason, "Belt snapped");
});

test("night shift crossing midnight, with a breakdown after midnight", async () => {
  const r = await log({
    shiftStartTime: "22:00",
    shiftEndTime: "06:00",
    unitsProduced: 300,
    breakdownStartTime: "02:00",
    breakdownEndTime: "02:30",
  });
  assert.equal(r.status, 201);
  assert.ok(new Date(r.body.shiftEndTime) > new Date(r.body.shiftStartTime));
  assert.equal(r.body.downtimeMinutes, 30);
});

test("breakdown outside the shift is refused", async () => {
  const r = await log({ unitsProduced: 5, breakdownStartTime: "18:00", breakdownEndTime: "18:30" });
  assert.equal(r.status, 400);
});

test("breakdown needs both start and end", async () => {
  const r = await log({ unitsProduced: 5, breakdownStartTime: "10:00" });
  assert.equal(r.status, 400);
});

test("bit changes and boxes are stored", async () => {
  const r = await log({ unitsProduced: 250, bitsChanged: 2, boxes: 5 });
  assert.equal(r.status, 201);
  assert.equal(r.body.bitsChanged, 2);
  assert.equal(r.body.boxes, 5);
});

test("a log needs units produced or units inspected", async () => {
  const r = await log({});
  assert.equal(r.status, 400);
});

test("product steps carry their form type", async () => {
  const proc = await api("POST", "/api/processes", {
    token: manager,
    body: { name: uniq("qc"), formType: "inspection" },
  });
  assert.equal(proc.status, 201);
  assert.equal(proc.body.formType, "inspection");

  const steps = await api("GET", `/api/products/${chain.productId}/processes`, { token: operator });
  assert.ok(steps.body.every((s) => s.formType === "machining"));
});

test("logistics (count) steps are left out of efficiency", async () => {
  const proc = (
    await api("POST", "/api/processes", { token: manager, body: { name: uniq("pallet"), formType: "count" } })
  ).body;
  const before = (await api("GET", "/api/reports/efficiency", { token: manager })).body.totals.units;
  const r = await log({ processId: proc.id, unitsProduced: 777 });
  assert.equal(r.status, 201);
  const afterUnits = (await api("GET", "/api/reports/efficiency", { token: manager })).body.totals.units;
  assert.equal(afterUnits, before);
});
