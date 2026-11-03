import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  ordersTable,
  orderProcessesTable,
  productionEntryTable,
  machinesTable,
  processesTable,
  productsTable,
} from "../db/schema.js";

/** High-level production summary for the manager dashboard. */
export async function getSummary() {
  const byStatus = await db
    .select({ status: ordersTable.status, count: sql`count(*)::int` })
    .from(ordersTable)
    .groupBy(ordersTable.status);

  const [totals] = await db
    .select({
      orders: sql`count(*)::int`,
    })
    .from(ordersTable);

  // Aggregate unit progress across all order processes.
  const [units] = await db
    .select({
      planned: sql`coalesce(sum(${orderProcessesTable.availableQuantity}),0)::int`,
      completed: sql`coalesce(sum(${orderProcessesTable.completedQuantity}),0)::int`,
    })
    .from(orderProcessesTable);

  const statusMap = { Pending: 0, "In Progress": 0, Completed: 0 };
  for (const r of byStatus) statusMap[r.status] = r.count;

  return {
    totalOrders: totals?.orders ?? 0,
    ordersByStatus: statusMap,
    units: {
      planned: units?.planned ?? 0,
      completed: units?.completed ?? 0,
    },
  };
}

// Parse a stored issue-reason value (JSON array, plain string, or null).
function parseReasons(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [value];
  }
}

const UNITS = sql`coalesce(sum(${productionEntryTable.unitsProduced}),0)::int`;
// Shift hours: null shift windows (work-order-sourced entries) are skipped by sum().
const HOURS = sql`coalesce(sum(extract(epoch from (${productionEntryTable.shiftEndTime} - ${productionEntryTable.shiftStartTime})))/3600.0, 0)::float`;
const ENTRIES = sql`count(*)::int`;

function rate(units, hours) {
  return hours > 0 ? Math.round((units / hours) * 10) / 10 : null;
}

/**
 * Shift-efficiency analytics built entirely from production entries:
 * throughput by machine/process/product/worker, losses by cause, and a daily
 * output trend. Optional date range (ISO strings) on the entry date.
 */
export async function getEfficiency({ from, to } = {}) {
  const filters = [];
  if (from) filters.push(gte(productionEntryTable.date, new Date(from)));
  if (to) filters.push(lte(productionEntryTable.date, new Date(to)));
  const where = filters.length ? and(...filters) : undefined;

  const [totals] = await db
    .select({ units: UNITS, hours: HOURS, entries: ENTRIES })
    .from(productionEntryTable)
    .where(where);

  const byMachine = await db
    .select({
      machineId: machinesTable.id,
      machineName: machinesTable.name,
      units: UNITS,
      hours: HOURS,
      entries: ENTRIES,
    })
    .from(productionEntryTable)
    .innerJoin(machinesTable, eq(machinesTable.id, productionEntryTable.machineId))
    .where(where)
    .groupBy(machinesTable.id, machinesTable.name);

  const byProcess = await db
    .select({
      processId: processesTable.id,
      processName: processesTable.name,
      units: UNITS,
      hours: HOURS,
      entries: ENTRIES,
    })
    .from(productionEntryTable)
    .innerJoin(processesTable, eq(processesTable.id, productionEntryTable.processId))
    .where(where)
    .groupBy(processesTable.id, processesTable.name);

  const byProduct = await db
    .select({
      productId: productsTable.id,
      productName: productsTable.name,
      units: UNITS,
      entries: ENTRIES,
    })
    .from(productionEntryTable)
    .innerJoin(productsTable, eq(productsTable.id, productionEntryTable.productId))
    .where(where)
    .groupBy(productsTable.id, productsTable.name);

  const byWorker = await db
    .select({
      workerName: productionEntryTable.workerName,
      units: UNITS,
      entries: ENTRIES,
    })
    .from(productionEntryTable)
    .where(where)
    .groupBy(productionEntryTable.workerName);

  const daily = await db
    .select({
      day: sql`to_char(${productionEntryTable.date}::date, 'YYYY-MM-DD')`,
      units: UNITS,
    })
    .from(productionEntryTable)
    .where(where)
    .groupBy(sql`${productionEntryTable.date}::date`)
    .orderBy(sql`${productionEntryTable.date}::date`);

  // Losses by cause: parse the reason values and tally in JS.
  const reasonRows = await db
    .select({ reason: productionEntryTable.productionIssueReason })
    .from(productionEntryTable)
    .where(where);
  const lossCounts = new Map();
  for (const r of reasonRows) {
    for (const reason of parseReasons(r.reason)) {
      lossCounts.set(reason, (lossCounts.get(reason) || 0) + 1);
    }
  }
  const lossByCause = [...lossCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const addRate = (rows) =>
    rows
      .map((r) => ({ ...r, ratePerHour: rate(r.units, r.hours) }))
      .sort((a, b) => b.units - a.units);

  return {
    totals: {
      units: totals?.units ?? 0,
      entries: totals?.entries ?? 0,
      hours: Math.round((totals?.hours ?? 0) * 10) / 10,
      avgRatePerHour: rate(totals?.units ?? 0, totals?.hours ?? 0),
      issuesLogged: lossByCause.reduce((s, l) => s + l.count, 0),
    },
    byMachine: addRate(byMachine),
    byProcess: addRate(byProcess),
    byProduct: byProduct.sort((a, b) => b.units - a.units),
    byWorker: byWorker.sort((a, b) => b.units - a.units),
    lossByCause,
    daily,
  };
}
