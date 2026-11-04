// Wipe production data and load the Inviu catalog from catalog.js.
//
//   npm run catalog:load -- --wipe
//
// Clears work orders, production logs, inventory, audit log, products, processes
// and machines (ids restart at 1), then inserts the catalog. Users are kept.
// Refuses to run without --wipe so it can't be triggered by accident.

import { pool } from "../config/db.js";
import { PROCESSES, MACHINE_GROUPS, PRODUCTS } from "./catalog.js";

export function catalogStatements() {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const out = [
    `TRUNCATE production_entry, order_process_machine, order_processes, orders,
       product_process_inventory, product_process_mapping, machine_process_mapping,
       machines, processes, products, audit_log RESTART IDENTITY CASCADE`,
  ];

  // Ids restart at 1, so each row's id is its 1-based position.
  const processId = new Map(PROCESSES.map((p, i) => [p.name, i + 1]));
  out.push(
    `INSERT INTO processes (name, form_type) VALUES ` +
      PROCESSES.map((p) => `(${q(p.name)}, ${q(p.formType)})`).join(", ")
  );

  const machines = MACHINE_GROUPS.flatMap((g) => g.codes.map((code) => ({ code, processes: g.processes })));
  out.push(`INSERT INTO machines (name) VALUES ` + machines.map((m) => `(${q(m.code)})`).join(", "));
  const mpm = machines.flatMap((m, i) => m.processes.map((p) => `(${i + 1}, ${must(processId, p)})`));
  out.push(`INSERT INTO machine_process_mapping (machine_id, process_id) VALUES ` + mpm.join(", "));

  out.push(
    `INSERT INTO products (name, category) VALUES ` +
      PRODUCTS.map((p) => `(${q(p.name)}, ${q(p.category)})`).join(", ")
  );
  const ppm = [];
  const inv = [];
  PRODUCTS.forEach((p, i) =>
    p.steps.forEach((step, s) => {
      ppm.push(`(${i + 1}, ${must(processId, step)}, ${s + 1})`);
      inv.push(`(${i + 1}, ${must(processId, step)}, 0)`);
    })
  );
  out.push(`INSERT INTO product_process_mapping (product_id, process_id, sequence) VALUES ` + ppm.join(", "));
  out.push(
    `INSERT INTO product_process_inventory (product_id, process_id, available_quantity) VALUES ` + inv.join(", ")
  );
  return out;
}

function must(map, name) {
  const id = map.get(name);
  if (!id) throw new Error(`Unknown process in catalog: ${name}`);
  return id;
}

async function main() {
  if (!process.argv.includes("--wipe")) {
    console.error("Refusing to run: this deletes all orders and logs. Pass --wipe to confirm.");
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of catalogStatements()) await client.query(stmt);
    await client.query("COMMIT");
    const machineCount = MACHINE_GROUPS.reduce((n, g) => n + g.codes.length, 0);
    console.log(
      `Catalog loaded: ${PRODUCTS.length} products, ${PROCESSES.length} process steps, ${machineCount} machines.`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
