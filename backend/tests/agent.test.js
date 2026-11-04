import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, setupProductChain, pool } from "./helpers.js";

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

const today = new Date().toISOString().slice(0, 10);

test("overview is manager-only", async () => {
  const r = await api("GET", "/api/agent/overview", { token: operator });
  assert.equal(r.status, 403);
});

test("overview returns the full agent view", async () => {
  await api("PUT", `/api/processes/${chain.processIds[0]}`, {
    token: manager,
    body: { name: `std-${Date.now()}`, standardRatePerHour: 100 },
  });
  const log = await api("POST", "/api/production-entries", {
    token: operator,
    body: {
      productId: chain.productId, processId: chain.processIds[0], machineId: chain.machineIds[0],
      workerName: "T", shiftStartTime: "09:00", shiftEndTime: "17:00", unitsProduced: 600,
      breakdownStartTime: "10:00", breakdownEndTime: "11:00", downtimeReason: "Machine fault", date: today,
    },
  });
  assert.equal(log.status, 201);

  const r = await api("GET", `/api/agent/overview?from=${today}&to=${today}`, { token: manager });
  assert.equal(r.status, 200);
  for (const k of ["period", "plant", "steps", "machines", "daily", "pareto", "findings", "forecast", "pipeline", "learning", "actions", "settings"]) {
    assert.ok(k in r.body, `missing ${k}`);
  }
  assert.equal(r.body.askEnabled, false);
  const m = r.body.machines.find((x) => x.machineId === chain.machineIds[0]);
  assert.ok(m, "machine row present");
  // 8 h shift, 60 min breakdown: A = 420/480; P = 600 / (100/h * 7 h)
  assert.ok(Math.abs(m.kpi.A - 420 / 480) < 1e-9);
  assert.ok(Math.abs(m.kpi.P - 600 / 700) < 1e-9);
  assert.equal(m.kpi.nDown, 1);
  assert.equal(r.body.pipeline.length, 6);
});

test("open orders appear in the forecast and drive the constraint", async () => {
  const o = await api("POST", "/api/work-orders", {
    token: manager,
    body: { customerName: "Fcst", productId: chain.productId, quantity: 500, dueDate: new Date(Date.now() + 86400000).toISOString() },
  });
  assert.equal(o.status, 201);
  const r = await api("GET", `/api/agent/overview?from=${today}&to=${today}`, { token: manager });
  const f = r.body.forecast.orders.find((x) => x.orderId === o.body.id);
  assert.ok(f, "order in forecast");
  assert.equal(f.quantity, 500);
  assert.ok(r.body.constraint, "a constraint is named");
});

test("settings round-trip", async () => {
  const before = (await api("GET", "/api/agent/settings", { token: manager })).body;
  const put = await api("PUT", "/api/agent/settings", { token: manager, body: { valuePerPiece: 2.5, targetOee: 0.7 } });
  assert.equal(put.status, 200);
  assert.equal(put.body.valuePerPiece, 2.5);
  assert.equal(put.body.targetOee, 0.7);
  await api("PUT", "/api/agent/settings", { token: manager, body: { valuePerPiece: before.valuePerPiece ?? null, targetOee: before.targetOee } });
});

test("'Not the cause' lowers that rule's weight; reset restores it", async () => {
  await api("DELETE", "/api/agent/learning", { token: manager });
  const fb = await api("POST", "/api/agent/feedback", {
    token: manager,
    body: { rule: "speed", scope: "machine:test", title: "Test finding", action: "rejected" },
  });
  assert.equal(fb.status, 201);
  let r = await api("GET", "/api/agent/overview", { token: manager });
  assert.equal(r.body.learning.find((x) => x.rule === "speed").factor, 0.8);
  await api("DELETE", "/api/agent/learning", { token: manager });
  r = await api("GET", "/api/agent/overview", { token: manager });
  assert.equal(r.body.learning.find((x) => x.rule === "speed").factor, 1);
});

test("feedback rejects unknown rules", async () => {
  const r = await api("POST", "/api/agent/feedback", {
    token: manager,
    body: { rule: "nope", scope: "x", title: "x", action: "done" },
  });
  assert.equal(r.status, 400);
});

test("ask says plainly when it is not set up", async () => {
  const r = await api("POST", "/api/agent/ask", { token: manager, body: { messages: [{ role: "user", content: "hi" }] } });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /not set up/);
});

test("ask runs Claude's tool calls against the engine and returns the answer", async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, opts) => {
    if (!String(url).startsWith("https://api.anthropic.com")) return realFetch(url, opts);
    const body = JSON.parse(opts.body);
    seen.push(body);
    if (seen.length === 1) {
      return new Response(JSON.stringify({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "get_plant_summary", input: {} }],
      }), { status: 200 });
    }
    const toolResult = JSON.parse(body.messages.at(-1).content[0].content);
    return new Response(JSON.stringify({
      stop_reason: "end_turn",
      content: [{ type: "text", text: `Plant OEE period starts ${toolResult.period.from}.` }],
    }), { status: 200 });
  };
  process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    const r = await api("POST", "/api/agent/ask", {
      token: manager,
      body: { messages: [{ role: "user", content: "How are we doing?" }], from: today, to: today },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.answer, `Plant OEE period starts ${today}.`);
    assert.deepEqual(r.body.toolsUsed, ["get plant summary"]);
    assert.equal(seen.length, 2);
    assert.ok(seen[0].tools.some((t) => t.name === "get_findings"));
    assert.match(seen[0].system, /never invent numbers/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = realFetch;
  }
});
