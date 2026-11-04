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

const UNITS = sql`coalesce(sum(${productionEntryTable.unitsProduced}),0)::int`; // good units
const REJECTED = sql`coalesce(sum(${productionEntryTable.rejectedUnits}),0)::int`;
// Shift hours: null shift windows (work-order-sourced entries) are skipped by sum().
const HOURS = sql`coalesce(sum(extract(epoch from (${productionEntryTable.shiftEndTime} - ${productionEntryTable.shiftStartTime})))/3600.0, 0)::float`;
const DOWNTIME_HOURS = sql`coalesce(sum(${productionEntryTable.downtimeMinutes})/60.0, 0)::float`;
const ENTRIES = sql`count(*)::int`;

function rate(units, hours) {
  return hours > 0 ? Math.round((units / hours) * 10) / 10 : null;
}

const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10); // fraction -> 1-dp percent

// OEE = Availability x Performance x Quality, each 0..1, from one aggregated group.
// Performance needs a standard rate (units/hr); without it, performance/oee stay null.
function oeeFactors({ units = 0, rejected = 0, hours = 0, downtimeHours = 0, standardRate = null }) {
  const planned = hours;
  const run = Math.max(planned - downtimeHours, 0);
  const total = units + rejected;
  const availability = planned > 0 ? run / planned : null;
  const quality = total > 0 ? units / total : null;
  const performance = standardRate && run > 0 ? Math.min(units / run / standardRate, 1) : null;
  const oee =
    availability != null && performance != null && quality != null
      ? availability * performance * quality
      : null;
  return {
    availability: pct(availability),
    performance: pct(performance),
    quality: pct(quality),
    oee: pct(oee),
  };
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
    .select({ units: UNITS, rejected: REJECTED, hours: HOURS, downtimeHours: DOWNTIME_HOURS, entries: ENTRIES })
    .from(productionEntryTable)
    .where(where);

  const byMachine = await db
    .select({
      machineId: machinesTable.id,
      machineName: machinesTable.name,
      units: UNITS,
      rejected: REJECTED,
      hours: HOURS,
      downtimeHours: DOWNTIME_HOURS,
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
      standardRate: processesTable.standardRatePerHour,
      units: UNITS,
      rejected: REJECTED,
      hours: HOURS,
      downtimeHours: DOWNTIME_HOURS,
      entries: ENTRIES,
    })
    .from(productionEntryTable)
    .innerJoin(processesTable, eq(processesTable.id, productionEntryTable.processId))
    .where(where)
    .groupBy(processesTable.id, processesTable.name, processesTable.standardRatePerHour);

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

  const withRate = (r) => ({ ...r, ratePerHour: rate(r.units, r.hours) });

  // Per-machine: availability + quality (no per-machine standard → no performance).
  const machines = byMachine
    .map((r) => ({ ...withRate(r), ...oeeFactors(r) }))
    .sort((a, b) => b.units - a.units);

  // Per-process: full OEE where the process has a standard rate set.
  const processes = byProcess
    .map((r) => ({ ...withRate(r), standardRate: r.standardRate ?? null, ...oeeFactors(r) }))
    .sort((a, b) => b.units - a.units);

  // Overall: availability + quality from totals; performance = good-weighted average
  // of the processes that have a standard; OEE = A x P x Q.
  const overall = oeeFactors({
    units: totals?.units ?? 0,
    rejected: totals?.rejected ?? 0,
    hours: totals?.hours ?? 0,
    downtimeHours: totals?.downtimeHours ?? 0,
  });
  let perfSum = 0;
  let perfWeight = 0;
  for (const p of processes) {
    if (p.performance != null) {
      perfSum += p.performance * p.units;
      perfWeight += p.units;
    }
  }
  const overallPerformance = perfWeight > 0 ? Math.round((perfSum / perfWeight) * 10) / 10 : null;
  const overallOee =
    overall.availability != null && overallPerformance != null && overall.quality != null
      ? Math.round(
          (overall.availability / 100) * (overallPerformance / 100) * (overall.quality / 100) * 1000
        ) / 10
      : null;

  return {
    totals: {
      units: totals?.units ?? 0,
      rejected: totals?.rejected ?? 0,
      entries: totals?.entries ?? 0,
      hours: Math.round((totals?.hours ?? 0) * 10) / 10,
      downtimeHours: Math.round((totals?.downtimeHours ?? 0) * 10) / 10,
      avgRatePerHour: rate(totals?.units ?? 0, totals?.hours ?? 0),
      issuesLogged: lossByCause.reduce((s, l) => s + l.count, 0),
      availability: overall.availability,
      performance: overallPerformance,
      quality: overall.quality,
      oee: overallOee,
    },
    byMachine: machines,
    byProcess: processes,
    byProduct: byProduct.sort((a, b) => b.units - a.units),
    byWorker: byWorker.sort((a, b) => b.units - a.units),
    lossByCause,
    daily,
  };
}
