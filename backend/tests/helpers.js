// Shared test utilities for the FlowForge backend integration suite.
//
// Each test file boots the real Express app (via createApp) on an ephemeral
// port and talks to it over HTTP with the global fetch, exactly as a client
// would. The suite relies on the DB already being migrated + seeded (see the
// `test:reset` npm script, or the README in this folder). Tests create their
// own master data with unique names and key off the returned ids, so the suite
// is safe to run repeatedly without a reset and does not depend on seed ids
// (other than the two seeded users, whose creation is idempotent).

import { createApp } from "../src/app.js";
import { pool } from "../src/config/db.js";

export { pool };

let _counter = 0;
export function uniq(prefix = "x") {
  _counter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${_counter}`;
}

// Start the app on an ephemeral port. Returns { base, server }.
export async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, server };
}

export async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

// Low-level request helper. Returns { status, body }.
export async function request(base, method, path, { token, body, rawBody, headers } = {}) {
  const h = { ...(headers || {}) };
  if (body !== undefined && rawBody === undefined) h["content-type"] = "application/json";
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers: h,
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// Make an api() bound to a base url.
export function makeApi(base) {
  return (method, path, opts) => request(base, method, path, opts);
}

export async function login(base, username, password) {
  const { status, body } = await request(base, "POST", "/api/auth/login", {
    body: { username, password },
  });
  if (status !== 200) throw new Error(`login failed for ${username}: ${status} ${JSON.stringify(body)}`);
  return body.token;
}

export async function loginBoth(base) {
  const manager = await login(base, "manager", "manager123");
  const operator = await login(base, "operator", "operator123");
  return { manager, operator };
}

/**
 * Create a product with an ordered process chain, machines mapped to every
 * process, and inventory stock per process. Returns ids needed by tests.
 *
 * @returns {{ productId, processIds: number[], machineIds: number[] }}
 */
export async function setupProductChain(base, managerToken, { processCount = 2, inventory = 100 } = {}) {
  const api = makeApi(base);
  const tag = uniq("prod");
  const product = (await api("POST", "/api/products", { token: managerToken, body: { name: tag } })).body;

  const processIds = [];
  const machineIds = [];
  for (let i = 0; i < processCount; i++) {
    const proc = (await api("POST", "/api/processes", { token: managerToken, body: { name: `${tag}-p${i}` } })).body;
    processIds.push(proc.id);
    // one machine per process, mapped to it
    const machine = (
      await api("POST", "/api/machines", { token: managerToken, body: { name: `${tag}-m${i}`, processIds: [proc.id] } })
    ).body;
    machineIds.push(machine.id);
  }

  await api("PUT", `/api/products/${product.id}/processes`, {
    token: managerToken,
    body: { processes: processIds.map((processId, idx) => ({ processId, sequence: idx + 1 })) },
  });

  for (const processId of processIds) {
    await api("PUT", `/api/inventory/product/${product.id}/process/${processId}`, {
      token: managerToken,
      body: { availableQuantity: inventory },
    });
  }

  return { productId: product.id, processIds, machineIds };
}
