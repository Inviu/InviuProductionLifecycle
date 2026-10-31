import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, stopServer, makeApi, pool } from "./helpers.js";

let base, server, api;

before(async () => {
  ({ base, server } = await startServer());
  api = makeApi(base);
});
after(async () => {
  await stopServer(server);
  await pool.end();
});

test("login success returns token + user", async () => {
  const { status, body } = await api("POST", "/api/auth/login", {
    body: { username: "manager", password: "manager123" },
  });
  assert.equal(status, 200);
  assert.ok(typeof body.token === "string" && body.token.length > 0, "expected a token string");
  assert.ok(body.user, "expected a user object");
  assert.equal(body.user.username, "manager");
  assert.equal(body.user.role, "manager");
  assert.ok(!("passwordHash" in body.user), "user must not leak passwordHash");
});

test("wrong password -> 401", async () => {
  const { status, body } = await api("POST", "/api/auth/login", {
    body: { username: "manager", password: "wrongpassword" },
  });
  assert.equal(status, 401);
  assert.ok(body.error);
});

test("unknown user -> 401", async () => {
  const { status } = await api("POST", "/api/auth/login", {
    body: { username: "nobody-here", password: "whatever" },
  });
  assert.equal(status, 401);
});

test("protected route with no token -> 401", async () => {
  const { status, body } = await api("GET", "/api/auth/me");
  assert.equal(status, 401);
  assert.ok(body.error);
});

test("protected route with malformed token -> 401", async () => {
  const { status } = await api("GET", "/api/auth/me", { token: "not.a.valid.jwt" });
  assert.equal(status, 401);
});

test("protected route with a well-formed token signed by a different secret -> 401", async () => {
  // Header.payload.signature shaped but bogus signature.
  const fake =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsInJvbGUiOiJtYW5hZ2VyIn0.bogussignature";
  const { status } = await api("GET", "/api/auth/me", { token: fake });
  assert.equal(status, 401);
});

test("valid token reaches /api/auth/me", async () => {
  const token = (await api("POST", "/api/auth/login", { body: { username: "operator", password: "operator123" } })).body.token;
  const { status, body } = await api("GET", "/api/auth/me", { token });
  assert.equal(status, 200);
  assert.equal(body.username, "operator");
  assert.equal(body.role, "operator");
});
