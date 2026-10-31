import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, uniq, pool } from "./helpers.js";

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

test("products: create / list / update / delete", async () => {
  const name = uniq("prod");
  const created = await api("POST", "/api/products", { token: manager, body: { name, description: "desc" } });
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.body.name, name);

  const list = await api("GET", "/api/products", { token: manager });
  assert.equal(list.status, 200);
  assert.ok(list.body.some((p) => p.id === id), "created product should appear in list");

  const updated = await api("PUT", `/api/products/${id}`, { token: manager, body: { name: name + "-upd" } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, name + "-upd");

  const del = await api("DELETE", `/api/products/${id}`, { token: manager });
  assert.equal(del.status, 200);

  const after = await api("GET", "/api/products", { token: manager });
  assert.ok(!after.body.some((p) => p.id === id), "deleted product should be gone");
});

test("update non-existent product -> 404", async () => {
  const { status } = await api("PUT", `/api/products/987654`, { token: manager, body: { name: uniq("x") } });
  assert.equal(status, 404);
});

test("delete non-existent product -> 404", async () => {
  const { status } = await api("DELETE", `/api/products/987654`, { token: manager });
  assert.equal(status, 404);
});

test("processes: create / list / update / delete", async () => {
  const name = uniq("proc");
  const created = await api("POST", "/api/processes", { token: manager, body: { name } });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const list = await api("GET", "/api/processes", { token: manager });
  assert.ok(list.body.some((p) => p.id === id));

  const upd = await api("PUT", `/api/processes/${id}`, { token: manager, body: { name: name + "-u" } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.name, name + "-u");

  const del = await api("DELETE", `/api/processes/${id}`, { token: manager });
  assert.equal(del.status, 200);
});

test("machines: create (with process mapping) / list / update / delete, and ?processId= filter", async () => {
  const proc = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("proc") } })).body;
  const other = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("proc") } })).body;

  const mName = uniq("mach");
  const created = await api("POST", "/api/machines", { token: manager, body: { name: mName, processIds: [proc.id] } });
  assert.equal(created.status, 201);
  const mId = created.body.id;

  const all = await api("GET", "/api/machines", { token: manager });
  assert.ok(all.body.some((m) => m.id === mId));

  // filter by the mapped process -> machine present
  const filtered = await api("GET", `/api/machines?processId=${proc.id}`, { token: manager });
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.some((m) => m.id === mId), "machine should appear for its mapped process");

  // filter by an unrelated process -> machine absent
  const otherFiltered = await api("GET", `/api/machines?processId=${other.id}`, { token: manager });
  assert.ok(!otherFiltered.body.some((m) => m.id === mId), "machine should not appear for unmapped process");

  const upd = await api("PUT", `/api/machines/${mId}`, { token: manager, body: { name: mName + "-u" } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.name, mName + "-u");

  const del = await api("DELETE", `/api/machines/${mId}`, { token: manager });
  assert.equal(del.status, 200);
});

test("product process chain: set with PUT and read back in sequence order", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: uniq("prod") } })).body;
  const a = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("A") } })).body;
  const b = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("B") } })).body;
  const c = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("C") } })).body;

  // Intentionally pass sequences out of insertion order to prove ordering is by sequence.
  const put = await api("PUT", `/api/products/${product.id}/processes`, {
    token: manager,
    body: {
      processes: [
        { processId: c.id, sequence: 3 },
        { processId: a.id, sequence: 1 },
        { processId: b.id, sequence: 2 },
      ],
    },
  });
  assert.equal(put.status, 200);

  const chain = await api("GET", `/api/products/${product.id}/processes`, { token: manager });
  assert.equal(chain.status, 200);
  assert.deepEqual(
    chain.body.map((p) => p.id),
    [a.id, b.id, c.id],
    "chain must come back ordered by sequence"
  );
  assert.deepEqual(chain.body.map((p) => p.sequence), [1, 2, 3]);

  // Replacing the chain should fully replace (not append).
  const put2 = await api("PUT", `/api/products/${product.id}/processes`, {
    token: manager,
    body: { processes: [{ processId: b.id, sequence: 1 }] },
  });
  assert.equal(put2.status, 200);
  const chain2 = await api("GET", `/api/products/${product.id}/processes`, { token: manager });
  assert.deepEqual(chain2.body.map((p) => p.id), [b.id]);
});

test("inventory: GET default 0, PUT set, GET reflects, adjust up/down", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: uniq("prod") } })).body;
  const proc = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("proc") } })).body;

  const g0 = await api("GET", `/api/inventory/product/${product.id}/process/${proc.id}`, { token: manager });
  assert.equal(g0.status, 200);
  assert.equal(g0.body.availableQuantity, 0, "missing inventory reads as 0");

  const set = await api("PUT", `/api/inventory/product/${product.id}/process/${proc.id}`, {
    token: manager,
    body: { availableQuantity: 30 },
  });
  assert.ok(set.status === 200 || set.status === 201);
  assert.equal(set.body.availableQuantity, 30);

  const g1 = await api("GET", `/api/inventory/product/${product.id}/process/${proc.id}`, { token: manager });
  assert.equal(g1.body.availableQuantity, 30);

  const up = await api("POST", `/api/inventory/product/${product.id}/process/${proc.id}/adjust`, {
    token: manager,
    body: { delta: 5 },
  });
  assert.equal(up.status, 200);
  assert.equal(up.body.availableQuantity, 35);

  const down = await api("POST", `/api/inventory/product/${product.id}/process/${proc.id}/adjust`, {
    token: manager,
    body: { delta: -10 },
  });
  assert.equal(down.body.availableQuantity, 25);
});

test("inventory negative guard: adjust below zero -> 400", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: uniq("prod") } })).body;
  const proc = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("proc") } })).body;
  await api("PUT", `/api/inventory/product/${product.id}/process/${proc.id}`, { token: manager, body: { availableQuantity: 3 } });

  const { status, body } = await api("POST", `/api/inventory/product/${product.id}/process/${proc.id}/adjust`, {
    token: manager,
    body: { delta: -10 },
  });
  assert.equal(status, 400);
  assert.ok(body.error);

  // and inventory is unchanged
  const g = await api("GET", `/api/inventory/product/${product.id}/process/${proc.id}`, { token: manager });
  assert.equal(g.body.availableQuantity, 3, "failed adjust must not mutate inventory");
});

test("inventory PUT set negative -> 400 (validation)", async () => {
  const product = (await api("POST", "/api/products", { token: manager, body: { name: uniq("prod") } })).body;
  const proc = (await api("POST", "/api/processes", { token: manager, body: { name: uniq("proc") } })).body;
  const { status } = await api("PUT", `/api/inventory/product/${product.id}/process/${proc.id}`, {
    token: manager,
    body: { availableQuantity: -5 },
  });
  assert.equal(status, 400);
});
