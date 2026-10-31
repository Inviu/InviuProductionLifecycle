// Seeds realistic master data so the app is usable immediately.
// Idempotent: if products already exist, it does nothing. Run with `npm run seed`.
//
// Creates two products, each with an ordered process chain, machines per
// process, product→process and machine→process mappings, and inventory
// stock per product/process pair.

import { db, pool } from "../config/db.js";
import {
  usersTable,
  productsTable,
  processesTable,
  machinesTable,
  productProcessMappingTable,
  machineProcessMappingTable,
  productProcessInventoryTable,
} from "./schema.js";
import { hashPassword } from "../services/auth.service.js";

// product name -> ordered list of process names
const PRODUCTS = {
  "Steel Bracket": ["Cutting", "Plating", "Chaffing", "Quality Check"],
  "Copper Connector": ["Cutting", "Stamping", "Plating", "Quality Check"],
};

// how many machines to create for each process
const MACHINES_PER_PROCESS = 2;
const INVENTORY_PER_PAIR = 100;

async function seedUsers() {
  const existing = await db.select().from(usersTable);
  if (existing.length > 0) return;
  const users = [
    { username: "manager", password: "manager123", role: "manager", displayName: "Shop Manager" },
    { username: "operator", password: "operator123", role: "operator", displayName: "Floor Operator" },
  ];
  for (const u of users) {
    await db.insert(usersTable).values({
      username: u.username,
      passwordHash: await hashPassword(u.password),
      role: u.role,
      displayName: u.displayName,
    });
  }
  console.log("Seeded users: manager/manager123, operator/operator123");
}

async function seed() {
  await seedUsers();

  const existing = await db.select().from(productsTable);
  if (existing.length > 0) {
    console.log("Products already exist — skipping product seed (it is idempotent).");
    return;
  }

  // 1. processes (unique set across all products), keep name -> id
  const allProcessNames = [...new Set(Object.values(PRODUCTS).flat())];
  const processId = {};
  for (const name of allProcessNames) {
    const [row] = await db
      .insert(processesTable)
      .values({ name })
      .returning();
    processId[name] = row.id;
  }

  // 2. machines per process + machine->process mapping
  for (const name of allProcessNames) {
    for (let i = 1; i <= MACHINES_PER_PROCESS; i++) {
      const [machine] = await db
        .insert(machinesTable)
        .values({ name: `${name} Machine ${i}` })
        .returning();
      await db.insert(machineProcessMappingTable).values({
        processId: processId[name],
        machineId: machine.id,
      });
    }
  }

  // 3. products + product->process mapping (in order) + inventory per pair
  for (const [productName, processNames] of Object.entries(PRODUCTS)) {
    const [product] = await db
      .insert(productsTable)
      .values({ name: productName, description: `${productName} production line` })
      .returning();

    let seq = 1;
    for (const pName of processNames) {
      await db.insert(productProcessMappingTable).values({
        productId: product.id,
        processId: processId[pName],
        sequence: seq,
      });
      await db.insert(productProcessInventoryTable).values({
        productId: product.id,
        processId: processId[pName],
        availableQuantity: INVENTORY_PER_PAIR,
      });
      seq += 1;
    }
  }

  const products = await db.select().from(productsTable);
  const processes = await db.select().from(processesTable);
  const machines = await db.select().from(machinesTable);
  console.log(
    `Seeded ${products.length} products, ${processes.length} processes, ${machines.length} machines.`
  );
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
