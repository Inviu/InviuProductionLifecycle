import { and, desc, eq } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  productionEntryTable,
  productsTable,
  processesTable,
  machinesTable,
  machineProcessMappingTable,
} from "../db/schema.js";
import { AppError } from "../middleware/validate.js";
import { autoCreditWorkOrder } from "./workOrder.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Build a Date from an entry date (or today) and an "HH:MM" clock time.
function combineDateTime(dateString, hhmm) {
  const dt = new Date(`${dateString}T${hhmm}:00Z`);
  if (Number.isNaN(dt.getTime())) {
    throw new AppError("Invalid time format. Use HH:MM.", 400);
  }
  return dt;
}

// A clock time that falls on or before `after` belongs to the next day (night shift).
function rollPast(dt, after) {
  return dt <= after ? new Date(dt.getTime() + DAY_MS) : dt;
}

/**
 * Record a shift production entry. Validates that the product, process and
 * (optional) machine exist and are consistent before inserting.
 */
export async function createProductionEntry(input, user) {
  const {
    productId,
    processId,
    machineId,
    workerName,
    shiftStartTime,
    shiftEndTime,
    rejectedUnits,
    downtimeMinutes,
    downtimeReason,
    breakdownStartTime,
    breakdownEndTime,
    bitsChanged,
    unitsInspected,
    boxes,
    date,
    productionIssueReason,
  } = input;

  // Inspection steps send units inspected; good parts = inspected - rejections.
  const rejected = Number.isFinite(rejectedUnits) ? rejectedUnits : 0;
  const unitsProduced =
    unitsInspected != null ? unitsInspected - rejected : input.unitsProduced;

  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product) throw new AppError("Product not found", 400);

  const [process] = await db
    .select({ id: processesTable.id })
    .from(processesTable)
    .where(eq(processesTable.id, processId));
  if (!process) throw new AppError("Process not found", 400);

  // If a machine is given, it must exist and be mapped to this process.
  if (machineId != null) {
    const [machine] = await db
      .select({ id: machinesTable.id })
      .from(machinesTable)
      .where(eq(machinesTable.id, machineId));
    if (!machine) throw new AppError("Machine not found", 400);

    const [mapping] = await db
      .select({ id: machineProcessMappingTable.id })
      .from(machineProcessMappingTable)
      .where(
        and(
          eq(machineProcessMappingTable.machineId, machineId),
          eq(machineProcessMappingTable.processId, processId)
        )
      );
    if (!mapping) {
      throw new AppError("Machine is not assigned to this process", 400);
    }
  }

  const entryDate = date ? new Date(date) : new Date();
  if (Number.isNaN(entryDate.getTime())) {
    throw new AppError("Invalid date", 400);
  }
  const dateString = entryDate.toISOString().split("T")[0];
  const startDateTime = combineDateTime(dateString, shiftStartTime);
  const endDateTime = rollPast(combineDateTime(dateString, shiftEndTime), startDateTime);

  // Breakdown window inside the shift; its length becomes the downtime minutes.
  let breakdownStart = null;
  let breakdownEnd = null;
  let downtime = Number.isFinite(downtimeMinutes) ? downtimeMinutes : 0;
  if (breakdownStartTime && breakdownEndTime) {
    breakdownStart = combineDateTime(dateString, breakdownStartTime);
    if (breakdownStart < startDateTime) breakdownStart = new Date(breakdownStart.getTime() + DAY_MS);
    breakdownEnd = rollPast(combineDateTime(dateString, breakdownEndTime), breakdownStart);
    if (breakdownStart < startDateTime || breakdownEnd > endDateTime) {
      throw new AppError("Breakdown time must fall within the shift start and end time", 400);
    }
    downtime = Math.round((breakdownEnd - breakdownStart) / 60000);
  }

  let reasonValue = null;
  if (Array.isArray(productionIssueReason)) {
    reasonValue = productionIssueReason.length
      ? JSON.stringify(productionIssueReason)
      : null;
  } else if (typeof productionIssueReason === "string" && productionIssueReason.trim()) {
    reasonValue = productionIssueReason.trim();
  }

  const resolvedWorker =
    (workerName && workerName.trim()) || user?.username || "Unknown";

  const [row] = await db
    .insert(productionEntryTable)
    .values({
      productId,
      processId,
      machineId: machineId ?? null,
      workerName: resolvedWorker,
      shiftStartTime: startDateTime,
      shiftEndTime: endDateTime,
      date: entryDate,
      unitsProduced,
      rejectedUnits: rejected,
      downtimeMinutes: downtime,
      downtimeReason: downtimeReason?.trim() || null,
      breakdownStart,
      breakdownEnd,
      bitsChanged: Number.isFinite(bitsChanged) ? bitsChanged : 0,
      unitsInspected: unitsInspected ?? null,
      boxes: boxes ?? null,
      productionIssueReason: reasonValue,
    })
    .returning();

  // Auto-credit the matching open work order with the good units (best-effort:
  // a shop-floor log must never fail because no order matches).
  try {
    const credited = await autoCreditWorkOrder({
      productId,
      processId,
      quantity: unitsProduced,
      user,
    });
    if (credited) row.creditedToOrder = credited.orderId;
  } catch {
    /* ignore — the production entry is saved regardless */
  }

  return row;
}

/**
 * List production entries, newest first, enriched with product/process/machine
 * names for the web dashboard. Supports optional productId / processId filters.
 */
export async function listProductionEntries({ productId, processId } = {}) {
  const filters = [];
  if (productId) filters.push(eq(productionEntryTable.productId, Number(productId)));
  if (processId) filters.push(eq(productionEntryTable.processId, Number(processId)));

  const rows = await db
    .select({
      id: productionEntryTable.id,
      productId: productionEntryTable.productId,
      productName: productsTable.name,
      processId: productionEntryTable.processId,
      processName: processesTable.name,
      formType: processesTable.formType,
      category: productsTable.category,
      machineId: productionEntryTable.machineId,
      machineName: machinesTable.name,
      workerName: productionEntryTable.workerName,
      shiftStartTime: productionEntryTable.shiftStartTime,
      shiftEndTime: productionEntryTable.shiftEndTime,
      date: productionEntryTable.date,
      unitsProduced: productionEntryTable.unitsProduced,
      rejectedUnits: productionEntryTable.rejectedUnits,
      unitsInspected: productionEntryTable.unitsInspected,
      downtimeMinutes: productionEntryTable.downtimeMinutes,
      downtimeReason: productionEntryTable.downtimeReason,
      breakdownStart: productionEntryTable.breakdownStart,
      breakdownEnd: productionEntryTable.breakdownEnd,
      bitsChanged: productionEntryTable.bitsChanged,
      boxes: productionEntryTable.boxes,
      productionIssueReason: productionEntryTable.productionIssueReason,
      createdAt: productionEntryTable.createdAt,
    })
    .from(productionEntryTable)
    .innerJoin(productsTable, eq(productsTable.id, productionEntryTable.productId))
    .innerJoin(processesTable, eq(processesTable.id, productionEntryTable.processId))
    .leftJoin(machinesTable, eq(machinesTable.id, productionEntryTable.machineId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(productionEntryTable.date), desc(productionEntryTable.id));

  // Normalise the reason field back into an array for the client.
  return rows.map((r) => ({
    ...r,
    productionIssueReasons: parseReasons(r.productionIssueReason),
  }));
}

function parseReasons(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    return [value];
  }
}
