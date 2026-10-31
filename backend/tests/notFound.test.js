import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, loginBoth, pool } from "./helpers.js";

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

test("GET a non-existent work order -> 404", async () => {
  const { status, body } = await api("GET", "/api/work-orders/987654", { token: manager });
  assert.equal(status, 404);
  assert.ok(body.error);
});

test("unknown /api route -> 404", async () => {
  const { status, body } = await api("GET", "/api/this-route-does-not-exist", { token: manager });
  assert.equal(status, 404);
  assert.ok(body.error);
});

test("health endpoint is open and returns ok", async () => {
  const { status, body } = await api("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.status, "true");
});
