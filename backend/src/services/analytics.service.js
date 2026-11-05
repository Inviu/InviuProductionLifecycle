// Efficiency agent engine.
//
// Everything is computed from what the floor logs in the app (shift entries:
// times, units, breakdown window + reason, bit changes, QC rejections) plus the
// open work orders and the standard rate per step. It mirrors the pipeline of
// the "Line 3 efficiency agent" concept, adapted to a multi-step job shop:
//
//   read logs -> KPIs (OEE = A x P x Q, MTBF, MTTR, bits/1,000, reject rate)
//   -> baselines (median / best of the previous 20 days with data)
//   -> anomaly checks + diagnosis rules -> ranked actions -> order forecast.
//
// The same functions back the web page and the "Ask the agent" tools.

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  productionEntryTable,
  processesTable,
  productsTable,
  machinesTable,
  machineProcessMappingTable,
  productProcessMappingTable,
  ordersTable,
  orderProcessesTable,
  agentFeedbackTable,
  appSettingsTable,
  usersTable,
} from "../db/schema.js";

// ---------------------------------------------------------------- constants
export const WORLD_CLASS = { oee: 0.85, A: 0.9, P: 0.95, Q: 0.999 };
const BASELINE_DAYS = 20; // compare with the previous 20 days that have data
const LOOKBACK_DAYS = 120; // how far back we search for those days
const MIN_BASELINE_DAYS = 3; // fewer than this = "still building a baseline"

export const RULES = {
  breakdown: { name: "Breakdown time above normal", conf: 0.7, kind: "Availability" },
  repeat: { name: "Same breakdown keeps coming back", conf: 0.8, kind: "Availability" },
  speed: { name: "Running below standard rate", conf: 0.65, kind: "Performance" },
  quality: { name: "Rejections above normal", conf: 0.75, kind: "Quality" },
  bits: { name: "Bits wearing out faster than normal", conf: 0.7, kind: "Cost" },
  flow: { name: "Work piling up at the constraint", conf: 0.8, kind: "Flow" },
  due: { name: "Order at risk of missing its due date", conf: 0.7, kind: "Prediction" },
  rates: { name: "Standard rates missing", conf: 0.95, kind: "Data" },
  entry: { name: "Logs that look mistyped", conf: 0.9, kind: "Data" },
};

// ---------------------------------------------------------------- helpers
const DAY = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => isoDay(new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const pctTxt = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const n0 = (x) => Math.round(x).toLocaleString("en-IN");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d) => (d ? `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]}` : "");
const n1 = (x) => (Math.round(x * 10) / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 });

function mean(arr) {
  const s = arr.filter((v) => v != null && Number.isFinite(v));
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

function quant(arr, q) {
  const s = arr.filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// ---------------------------------------------------------------- settings
export const DEFAULT_SETTINGS = { valuePerPiece: null, targetOee: 0.65 };

export async function getSettings() {
  const rows = await db.select().from(appSettingsTable);
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === "valuePerPiece") s.valuePerPiece = r.value == null || r.value === "" ? null : Number(r.value);
    if (r.key === "targetOee") s.targetOee = Number(r.value);
  }
  return s;
}

export async function saveSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const v = value == null || value === "" ? null : String(value);
    await db
      .insert(appSettingsTable)
      .values({ key, value: v, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: v, updatedAt: new Date() } });
  }
  return getSettings();
}

// ---------------------------------------------------------------- data load
async function loadEntries(fromDay, toDay) {
  const rows = await db
    .select({
      id: productionEntryTable.id,
      date: productionEntryTable.date,
      productId: productionEntryTable.productId,
      productName: productsTable.name,
      category: productsTable.category,
      processId: productionEntryTable.processId,
      stepName: processesTable.name,
      formType: processesTable.formType,
      std: processesTable.standardRatePerHour,
      machineId: productionEntryTable.machineId,
      machineName: machinesTable.name,
      worker: productionEntryTable.workerName,
      start: productionEntryTable.shiftStartTime,
      end: productionEntryTable.shiftEndTime,
      good: productionEntryTable.unitsProduced,
      rej: productionEntryTable.rejectedUnits,
      downMin: productionEntryTable.downtimeMinutes,
      downReason: productionEntryTable.downtimeReason,
      bdStart: productionEntryTable.breakdownStart,
      bits: productionEntryTable.bitsChanged,
    })
    .from(productionEntryTable)
    .innerJoin(productsTable, eq(productsTable.id, productionEntryTable.productId))
    .innerJoin(processesTable, eq(processesTable.id, productionEntryTable.processId))
    .leftJoin(machinesTable, eq(machinesTable.id, productionEntryTable.machineId))
    .where(
      and(
        gte(productionEntryTable.date, new Date(`${fromDay}T00:00:00Z`)),
        lte(productionEntryTable.date, new Date(`${toDay}T23:59:59Z`))
      )
    );

  return rows.map((e) => {
    const plannedMin =
      e.start && e.end ? Math.max(0, (new Date(e.end) - new Date(e.start)) / 60000) : 0;
    const downMin = Math.min(e.downMin || 0, plannedMin);
    const total = (e.good || 0) + (e.rej || 0);
    return {
      ...e,
      day: isoDay(new Date(e.date)),
      production: e.formType !== "count",
      plannedMin,
      downMin,
      runMin: plannedMin - downMin,
      total,
      idealMin: e.std ? (total / e.std) * 60 : null,
      qualMin: e.std ? ((e.rej || 0) / e.std) * 60 : null,
      machineKey: `${e.processId}:${e.machineId || 0}`,
      machineLabel: e.machineName || e.stepName,
    };
  });
}

// ---------------------------------------------------------------- KPI engine
function newAcc() {
  return {
    plannedMin: 0, runMin: 0, downMin: 0, runMinStd: 0, idealMin: 0, qualMin: 0,
    good: 0, rej: 0, entries: 0, nDown: 0, bits: 0, bitPieces: 0, days: new Set(),
  };
}
function add(acc, e) {
  acc.plannedMin += e.plannedMin;
  acc.runMin += e.runMin;
  acc.downMin += e.downMin;
  if (e.std && e.plannedMin > 0) {
    acc.runMinStd += e.runMin;
    acc.idealMin += e.idealMin;
    acc.qualMin += e.qualMin;
  }
  acc.good += e.good || 0;
  acc.rej += e.rej || 0;
  acc.entries += 1;
  if (e.downMin > 0) acc.nDown += 1;
  if (e.formType === "machining_bits") {
    acc.bits += e.bits || 0;
    acc.bitPieces += e.total;
  }
  acc.days.add(e.day);
}

/** Turn an accumulator into KPIs. All ratios are fractions (0..1). */
export function kpi(acc) {
  const A = acc.plannedMin > 0 ? acc.runMin / acc.plannedMin : null;
  const rawP = acc.runMinStd > 0 ? acc.idealMin / acc.runMinStd : null;
  const P = rawP == null ? null : Math.min(1, rawP);
  const total = acc.good + acc.rej;
  const Q = total > 0 ? acc.good / total : null;
  const OEE = A != null && P != null && Q != null ? A * P * Q : null;
  const days = acc.days.size || 0;
  return {
    A, P, rawP, Q, OEE,
    good: acc.good,
    rej: acc.rej,
    entries: acc.entries,
    days,
    plannedMin: acc.plannedMin,
    runMin: acc.runMin,
    downMin: acc.downMin,
    nDown: acc.nDown,
    // Waterfall units (only logs with a standard rate can be split into P/Q losses).
    speedLossMin: acc.runMinStd > 0 ? Math.max(0, acc.runMinStd - acc.idealMin) : null,
    qualLossMin: acc.runMinStd > 0 ? acc.qualMin : null,
    productiveMin: acc.runMinStd > 0 ? Math.max(0, Math.min(acc.idealMin, acc.runMinStd) - acc.qualMin) : null,
    unclassifiedMin: Math.max(0, acc.runMin - acc.runMinStd),
    ratePerHr: acc.runMin > 0 ? acc.good / (acc.runMin / 60) : null,
    MTBF: acc.nDown ? acc.runMin / 60 / acc.nDown : null,
    MTTR: acc.nDown ? acc.downMin / acc.nDown : null,
    bitsPer1000: acc.bitPieces > 0 ? (acc.bits / acc.bitPieces) * 1000 : null,
    bits: acc.bits,
    rejRate: total > 0 ? acc.rej / total : null,
    downPerDay: days ? acc.downMin / days : 0,
    goodPerDay: days ? acc.good / days : 0,
    downPerPlannedHr: acc.plannedMin > 0 ? acc.downMin / (acc.plannedMin / 60) : null,
    speedLossPerRunHr: acc.runMinStd > 0 ? Math.max(0, acc.runMinStd - acc.idealMin) / (acc.runMinStd / 60) : null,
  };
}

function groupBy(entries, keyFn) {
  const m = new Map();
  for (const e of entries) {
    const k = keyFn(e);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, newAcc());
    add(m.get(k), e);
  }
  return m;
}

// Baseline: per-day KPIs for the last BASELINE_DAYS days with data, before the window.
function baselineFor(entries, keyFn) {
  const byKeyDay = groupBy(entries, (e) => {
    const k = keyFn(e);
    return k == null ? null : `${k}|${e.day}`;
  });
  const perKey = new Map();
  for (const [kd, acc] of byKeyDay) {
    const i = kd.lastIndexOf("|");
    const k = kd.slice(0, i);
    const day = kd.slice(i + 1);
    if (!perKey.has(k)) perKey.set(k, []);
    perKey.get(k).push({ day, ...kpi(acc) });
  }
  const out = new Map();
  for (const [k, list] of perKey) {
    const recent = list.sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, BASELINE_DAYS);
    const pick = (f) => recent.map(f);
    out.set(k, {
      days: recent.length,
      ready: recent.length >= MIN_BASELINE_DAYS,
      OEE: quant(pick((d) => d.OEE), 0.5),
      best: quant(pick((d) => d.OEE), 0.9),
      A: quant(pick((d) => d.A), 0.5),
      P: quant(pick((d) => d.P), 0.5),
      Q: quant(pick((d) => d.Q), 0.5),
      // Breakdowns are sparse (most days have none), so use the mean, not the median.
      downPerPlannedHr: mean(pick((d) => d.downPerPlannedHr)),
      speedLossPerRunHr: quant(pick((d) => d.speedLossPerRunHr), 0.5),
      ratePerHr: quant(pick((d) => d.ratePerHr), 0.5),
      rejRate: quant(pick((d) => d.rejRate), 0.5),
      bitsPer1000: quant(pick((d) => d.bitsPer1000), 0.5),
      goodPerDay: quant(pick((d) => d.good), 0.5),
      // Pooled over the baseline days (a per-day median would only see days with a breakdown).
      ...(() => {
        const run = recent.reduce((a, d) => a + d.runMin, 0);
        const nd = recent.reduce((a, d) => a + d.nDown, 0);
        const dm = recent.reduce((a, d) => a + d.downMin, 0);
        return { MTBF: nd ? run / 60 / nd : null, MTTR: nd ? dm / nd : null };
      })(),
    });
  }
  return out;
}

// ---------------------------------------------------------------- catalog + orders
async function loadCatalog() {
  const steps = await db.select().from(processesTable).orderBy(processesTable.id);
  const machines = await db
    .select({ machineId: machinesTable.id, name: machinesTable.name, processId: machineProcessMappingTable.processId })
    .from(machineProcessMappingTable)
    .innerJoin(machinesTable, eq(machinesTable.id, machineProcessMappingTable.machineId));
  const routes = await db
    .select({
      productId: productProcessMappingTable.productId,
      processId: productProcessMappingTable.processId,
      sequence: productProcessMappingTable.sequence,
      category: productsTable.category,
    })
    .from(productProcessMappingTable)
    .innerJoin(productsTable, eq(productsTable.id, productProcessMappingTable.productId));
  return { steps, machines, routes };
}

async function loadOpenOrders() {
  const orders = await db
    .select({
      id: ordersTable.id,
      customerName: ordersTable.customerName,
      productId: ordersTable.productId,
      productName: productsTable.name,
      category: productsTable.category,
      quantity: ordersTable.quantity,
      status: ordersTable.status,
      dueDate: ordersTable.dueDate,
      createdDate: ordersTable.createdDate,
    })
    .from(ordersTable)
    .innerJoin(productsTable, eq(productsTable.id, ordersTable.productId))
    .where(inArray(ordersTable.status, ["Pending", "In Progress"]));
  if (!orders.length) return [];
  const steps = await db
    .select({
      orderId: orderProcessesTable.orderId,
      processId: orderProcessesTable.processId,
      sequence: orderProcessesTable.sequence,
      status: orderProcessesTable.status,
      available: orderProcessesTable.availableQuantity,
      completed: orderProcessesTable.completedQuantity,
    })
    .from(orderProcessesTable)
    .where(inArray(orderProcessesTable.orderId, orders.map((o) => o.id)));
  return orders.map((o) => ({
    ...o,
    steps: steps.filter((s) => s.orderId === o.id).sort((a, b) => a.sequence - b.sequence),
  }));
}

// ---------------------------------------------------------------- feedback
async function loadFeedback() {
  return db
    .select({
      id: agentFeedbackTable.id,
      rule: agentFeedbackTable.rule,
      scope: agentFeedbackTable.scope,
      title: agentFeedbackTable.title,
      action: agentFeedbackTable.action,
      metricKind: agentFeedbackTable.metricKind,
      metricKey: agentFeedbackTable.metricKey,
      metricLabel: agentFeedbackTable.metricLabel,
      metricBefore: agentFeedbackTable.metricBefore,
      createdAt: agentFeedbackTable.createdAt,
      by: usersTable.username,
    })
    .from(agentFeedbackTable)
    .leftJoin(usersTable, eq(usersTable.id, agentFeedbackTable.userId))
    .orderBy(sql`${agentFeedbackTable.createdAt} desc`);
}

const learningFactor = (fb, rule) => {
  const n = fb.filter((f) => f.rule === rule && f.action === "rejected").length;
  return Math.max(0.3, Math.pow(0.8, n));
};

export async function recordFeedback({ rule, scope, title, action, metric }, user) {
  if (!RULES[rule]) throw Object.assign(new Error("Unknown rule"), { status: 400 });
  const [row] = await db
    .insert(agentFeedbackTable)
    .values({
      rule,
      scope,
      title,
      action,
      metricKind: metric?.kind ?? null,
      metricKey: metric?.key ?? null,
      metricLabel: metric?.label ?? null,
      metricBefore: metric?.value == null ? null : String(metric.value),
      userId: user?.id ?? null,
    })
    .returning();
  return row;
}

export async function resetLearning() {
  await db.delete(agentFeedbackTable);
}

// A finding's tracked metric, recomputed for any set of entries.
function metricValue(kind, key, entries) {
  const pick = (f) => {
    const acc = newAcc();
    entries.filter(f).forEach((e) => add(acc, e));
    return kpi(acc);
  };
  switch (kind) {
    case "down_per_day": return pick((e) => e.machineKey === key).downPerDay;
    case "reason_per_day": {
      const [mk, reason] = key.split("|");
      const es = entries.filter((e) => e.machineKey === mk);
      const days = new Set(es.map((e) => e.day)).size;
      const mins = es.filter((e) => (e.downReason || "").toLowerCase() === reason).reduce((s, e) => s + e.downMin, 0);
      return days ? mins / days : null;
    }
    case "perf": return pick((e) => e.machineKey === key).P;
    case "rej_rate": {
      const [pid, prod] = key.split("|");
      return pick((e) => String(e.processId) === pid && (!prod || String(e.productId) === prod)).rejRate;
    }
    case "bits_per_1000": return pick((e) => e.machineKey === key).bitsPer1000;
    case "pace": return pick((e) => String(e.processId) === key).goodPerDay;
    default: return null;
  }
}

// ---------------------------------------------------------------- main
/**
 * Build the whole efficiency-agent view.
 * @param {{from?:string,to?:string,family?:string}} opts  ISO days, inclusive.
 */
export async function getOverview({ from, to, family } = {}) {
  const today = isoDay(new Date());
  to = to || today;
  from = from || addDays(to, -6);
  const settings = await getSettings();
  const [catalog, orders, feedback, all] = await Promise.all([
    loadCatalog(),
    loadOpenOrders(),
    loadFeedback(),
    loadEntries(addDays(from, -LOOKBACK_DAYS), to),
  ]);

  const famOk = (cat) => !family || cat === family;
  const scoped = all.filter((e) => famOk(e.category));
  const win = scoped.filter((e) => e.day >= from && e.day <= to);
  const hist = scoped.filter((e) => e.day < from);
  const prodWin = win.filter((e) => e.production);
  const prodHist = hist.filter((e) => e.production);
  const windowDays = Math.max(1, daysBetween(from, to) + 1);

  const stepById = new Map(catalog.steps.map((s) => [s.id, s]));
  const famSteps = new Set(
    catalog.routes.filter((r) => famOk(r.category)).map((r) => r.processId)
  );

  // ---- KPIs
  const plantAcc = newAcc();
  prodWin.forEach((e) => add(plantAcc, e));
  const plant = kpi(plantAcc);
  const stepAcc = groupBy(win, (e) => e.processId);
  const machineAcc = groupBy(prodWin, (e) => e.machineKey);

  // ---- baselines
  const baseStep = baselineFor(prodHist, (e) => e.processId);
  const baseMachine = baselineFor(prodHist, (e) => e.machineKey);
  const basePlant = baselineFor(prodHist, () => "plant").get("plant") || { days: 0, ready: false };

  // ---- step order for the line view: the family's routing, in sequence.
  const seqOf = new Map(); // processId -> earliest position in any in-scope routing
  const lines = {}; // family -> processId -> position (for the line view)
  for (const r of catalog.routes) {
    if (!famOk(r.category)) continue;
    const cur = seqOf.get(r.processId);
    seqOf.set(r.processId, cur == null ? r.sequence : Math.min(cur, r.sequence));
    const fam = r.category || "Other";
    lines[fam] ||= {};
    const fc = lines[fam][r.processId];
    // Longest routing wins so Notching sits after Punching, plating after machining.
    lines[fam][r.processId] = fc == null ? r.sequence : Math.max(fc, r.sequence);
  }

  // ---- WIP queues from open work orders
  const scopedOrders = orders.filter((o) => famOk(o.category));
  const queue = new Map(); // processId -> units waiting (available, not yet done)
  for (const o of scopedOrders) {
    for (const s of o.steps) {
      if (s.status === "Completed" || s.status === "Locked") continue;
      const q = Math.max(0, s.available - s.completed);
      queue.set(s.processId, (queue.get(s.processId) || 0) + q);
    }
  }

  // Recent pace per step: good units/day over the last 14 days up to `to`.
  const paceFrom = addDays(to, -13);
  const paceAcc = groupBy(scoped.filter((e) => e.day >= paceFrom), (e) => e.processId);
  const paceOf = (pid) => {
    const a = paceAcc.get(pid);
    if (!a) return 0;
    return a.good / Math.max(1, Math.min(14, a.days.size || 1));
  };

  // ---- steps
  const steps = [...famSteps]
    .map((pid) => {
      const s = stepById.get(pid);
      const acc = stepAcc.get(pid);
      const k = acc ? kpi(acc) : null;
      const b = baseStep.get(String(pid)) || null;
      const mapped = catalog.machines.filter((m) => m.processId === pid);
      const active = new Set(prodWin.filter((e) => e.processId === pid && e.machineId).map((e) => e.machineId));
      const q = queue.get(pid) || 0;
      const pace = paceOf(pid);
      return {
        id: pid,
        name: s.name,
        formType: s.formType,
        production: s.formType !== "count",
        std: s.standardRatePerHour,
        sequence: seqOf.get(pid) ?? 99,
        lines: Object.fromEntries(Object.entries(lines).filter(([, m]) => m[pid] != null).map(([f, m]) => [f, m[pid]])),
        kpi: k,
        baseline: b,
        status: statusOf(k?.OEE, b, settings.targetOee),
        machines: mapped.map((m) => ({ id: m.machineId, name: m.name, active: active.has(m.machineId) })),
        idleMachines: mapped.filter((m) => !active.has(m.machineId)).map((m) => m.name),
        queue: q,
        pacePerDay: r1(pace),
        queueDays: q > 0 ? (pace > 0 ? q / pace : Infinity) : 0,
      };
    })
    .sort((a, b) => a.sequence - b.sequence || a.id - b.id);

  // ---- constraint: most days of work waiting (queue / pace); fallback lowest output.
  const prodSteps = steps.filter((s) => s.production);
  let constraint = null;
  const queued = prodSteps.filter((s) => s.queue > 0);
  if (queued.length) {
    const c = queued.reduce((a, b) => (b.queueDays > a.queueDays ? b : a));
    constraint = {
      stepId: c.id,
      reason: "queue",
      text: `${n0(c.queue)} units are waiting at ${c.name}${
        Number.isFinite(c.queueDays) ? `, about ${n1(c.queueDays)} days of work at its recent pace` : ", and nothing was logged there recently"
      }.`,
    };
  } else {
    const withOut = prodSteps.filter((s) => s.kpi && s.kpi.goodPerDay > 0 && s.formType !== "inspection" && s.formType !== "packing");
    if (withOut.length) {
      const c = withOut.reduce((a, b) => (b.kpi.goodPerDay < a.kpi.goodPerDay ? b : a));
      constraint = {
        stepId: c.id,
        reason: "output",
        text: `No open work orders to show queues, so the constraint is taken as the machining step with the lowest output: ${c.name} at ${n0(c.kpi.goodPerDay)} units/day.`,
      };
    }
  }

  // ---- machines (KPI table rows)
  const machines = [...machineAcc.entries()]
    .map(([key, acc]) => {
      const e = prodWin.find((x) => x.machineKey === key);
      return {
        key,
        stepId: e.processId,
        stepName: e.stepName,
        formType: e.formType,
        machineId: e.machineId,
        name: e.machineLabel,
        std: e.std,
        kpi: kpi(acc),
        baseline: baseMachine.get(key) || null,
      };
    })
    .map((m) => ({ ...m, status: statusOf(m.kpi.OEE, m.baseline, settings.targetOee) }))
    .sort((a, b) => (seqOf.get(a.stepId) ?? 99) - (seqOf.get(b.stepId) ?? 99) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  // ---- daily series per step (+ plant), for the detail charts
  const allDays = [];
  for (let d = from; d <= to; d = addDays(d, 1)) allDays.push(d);
  const stepDay = groupBy(win, (e) => `${e.processId}|${e.day}`);
  const plantDay = groupBy(prodWin, (e) => e.day);
  const series = (getAcc) =>
    allDays.map((d) => {
      const acc = getAcc(d);
      const k = acc ? kpi(acc) : null;
      return {
        day: d,
        OEE: r3(k?.OEE), A: r3(k?.A), P: r3(k?.P), Q: r3(k?.Q),
        good: k?.good ?? 0, rej: k?.rej ?? 0, downMin: r1(k?.downMin ?? 0),
        rejRate: r3(k?.rejRate), bitsPer1000: r1(k?.bitsPer1000), bits: k?.bits ?? 0,
        logged: !!acc,
      };
    });
  const daily = { plant: series((d) => plantDay.get(d)) };
  for (const s of steps) daily[s.id] = series((d) => stepDay.get(`${s.id}|${d}`));

  // ---- loss Pareto per step (minutes)
  const pareto = {};
  for (const s of steps) {
    const es = win.filter((e) => e.processId === s.id);
    const map = new Map();
    for (const e of es) {
      if (e.downMin <= 0) continue;
      const reason = (e.downReason || "Breakdown, no reason given").trim();
      const label = reason;
      const cur = map.get(label.toLowerCase()) || { cause: label, minutes: 0, count: 0, machines: new Set() };
      cur.minutes += e.downMin;
      cur.count += 1;
      if (e.machineName) cur.machines.add(e.machineName);
      map.set(label.toLowerCase(), cur);
    }
    const rows = [...map.values()].map((r) => ({ ...r, machines: [...r.machines], type: "breakdown" }));
    if (s.kpi?.speedLossMin > 0.5) rows.push({ cause: "Slow running (below standard rate)", minutes: s.kpi.speedLossMin, type: "speed" });
    if (s.kpi?.qualLossMin > 0.5) rows.push({ cause: "Rejected units", minutes: s.kpi.qualLossMin, type: "quality" });
    pareto[s.id] = rows.sort((a, b) => b.minutes - a.minutes).slice(0, 8).map((r) => ({ ...r, minutes: r1(r.minutes) }));
  }

  // ---- order forecast
  const forecast = buildForecast(scopedOrders, paceOf, stepById, today);
  forecast.note = "Projected from the slowest production step's pace over the last 14 days. Plating, pallet and dispatch moves are not timed, so allow the plating vendor's lead time on top.";

  // ---- findings
  const findings = diagnose({
    win, prodWin, steps, machines, constraint, baseMachine, baseStep, forecast,
    settings, feedback, windowDays, catalog, famSteps,
  });

  // ---- learning table + results of actions marked done
  const learning = Object.entries(RULES).map(([id, r]) => ({
    rule: id,
    name: r.name,
    kind: r.kind,
    startConf: r.conf,
    factor: r3(learningFactor(feedback, id)),
    notCause: feedback.filter((f) => f.rule === id && f.action === "rejected").length,
    done: feedback.filter((f) => f.rule === id && f.action === "done").length,
  }));
  const allScopedSince = (since) => scoped.filter((e) => e.day >= since);
  const actions = feedback.slice(0, 20).map((f) => {
    const since = isoDay(new Date(f.createdAt));
    let after = null;
    if (f.action === "done" && f.metricKind) {
      after = metricValue(f.metricKind, f.metricKey, allScopedSince(addDays(since, 1)));
    }
    return {
      id: f.id,
      rule: f.rule,
      title: f.title,
      action: f.action,
      by: f.by,
      when: f.createdAt,
      metricLabel: f.metricLabel,
      metricKind: f.metricKind,
      before: f.metricBefore == null ? null : Number(f.metricBefore),
      after: after == null ? null : r3(after),
      daysSince: daysBetween(since, today),
    };
  });

  // ---- "how the agent got there"
  const machineHours = prodWin.reduce((s, e) => s + e.plannedMin, 0) / 60;
  const pipeline = [
    { t: "Read the floor logs", d: `${n0(win.length)} shift logs (${n1(machineHours)} machine-hours, ${n0(prodWin.filter((e) => e.downMin > 0).length)} breakdowns) from ${fmtDay(from)} to ${fmtDay(to)}, plus ${scopedOrders.length} open work order${scopedOrders.length === 1 ? "" : "s"}` },
    { t: "Calculated KPIs", d: "OEE, availability, performance, quality, MTBF, MTTR, bits per 1,000 and reject rate for every step and machine" },
    { t: "Compared with history", d: basePlant.days ? `Against the median and best of the previous ${basePlant.days} working day${basePlant.days === 1 ? "" : "s"}${basePlant.ready ? "" : " (baseline still building)"}` : "No earlier days logged yet, so figures are compared with the standard rates and the OEE target instead" },
    { t: "Found the constraint", d: constraint ? constraint.text : "No queues or output yet to find it" },
    { t: "Diagnosed causes", d: findings.length ? `${findings.length} finding${findings.length === 1 ? "" : "s"}, each traced to minutes lost, units and breakdown reasons` : "Nothing outside normal to explain" },
    { t: "Ranked actions", d: findings.length ? "By units recoverable per day × value at the constraint × confidence ÷ effort" : "Nothing to rank" },
  ];

  // ---- per product family: OEE and dispatched, for the end of each line
  const familyStats = {};
  for (const fam of Object.keys(lines)) {
    const acc = newAcc();
    prodWin.filter((e) => (e.category || "Other") === fam).forEach((e) => add(acc, e));
    const fk = kpi(acc);
    familyStats[fam] = {
      OEE: fk.OEE,
      dispatched: win.filter((e) => (e.category || "Other") === fam && e.stepName === "Dispatched").reduce((a, e) => a + (e.good || 0), 0),
      status: statusOf(fk.OEE, null, settings.targetOee),
    };
  }

  // ---- headline
  const real = findings.filter((f) => f.kind !== "Data");
  const pStatus = statusOf(plant.OEE, basePlant, settings.targetOee);
  let headline;
  if (!win.length && !real.length) headline = "No shift logs in this period yet. The briefing fills in as operators log their work in the app.";
  else if (!win.length) headline = `No shift logs in this period yet, but the open orders show an issue: ${real[0].title}.`;
  else if (!findings.length) headline = `Production is within its normal range${plant.OEE != null ? ` at ${pctTxt(plant.OEE)} OEE` : ""}. Nothing needs attention right now.`;
  else if (!real.length) headline = `Nothing is drifting, but the agent can’t see everything: ${findings[0].title.toLowerCase()}.`;
  else headline = `Main issue: ${real[0].title}.${real[0].onConstraint ? " It is on the constraint, so every minute lost there is lost output." : ""}`;

  return {
    period: { from, to, days: windowDays, family: family || null, today },
    settings,
    worldClass: WORLD_CLASS,
    freshness: win.length ? win.reduce((a, e) => (e.end && (!a || new Date(e.end) > a) ? new Date(e.end) : a), null) : null,
    plant: { kpi: plant, baseline: basePlant, status: pStatus, goodPieces: plant.good, dispatched: win.filter((e) => e.stepName === "Dispatched").reduce((s, e) => s + (e.good || 0), 0) },
    headline,
    families: familyStats,
    constraint,
    steps,
    machines,
    daily,
    pareto,
    findings,
    forecast,
    pipeline,
    learning,
    actions,
    counts: { logs: win.length, history: hist.length, orders: scopedOrders.length },
  };
}

function statusOf(oee, base, target) {
  if (oee == null) return "none";
  const ref = base?.ready && base.OEE != null ? base.OEE : target;
  if (oee >= ref - 0.02) return "ok";
  if (oee >= ref - 0.08) return "warn";
  return "bad";
}

// ---------------------------------------------------------------- forecast
function buildForecast(orders, paceOf, stepById, today) {
  const list = orders.map((o) => {
    const last = o.steps[o.steps.length - 1]; // Dispatched
    const done = last ? last.completed : 0;
    const remaining = Math.max(0, o.quantity - done);
    let worst = null;
    for (const s of o.steps) {
      if (stepById.get(s.processId)?.formType === "count") continue; // untimed logistics moves
      const rem = Math.max(0, o.quantity - s.completed);
      if (rem === 0) continue;
      const pace = paceOf(s.processId);
      const days = pace > 0 ? rem / pace : Infinity;
      if (!worst || days > worst.days) worst = { stepId: s.processId, step: stepById.get(s.processId)?.name, days, remaining: rem, pace };
    }
    const finish = worst && Number.isFinite(worst.days) ? addDays(today, Math.ceil(worst.days)) : remaining === 0 ? today : null;
    const due = o.dueDate ? isoDay(new Date(o.dueDate)) : null;
    const lateBy = due && finish ? daysBetween(due, finish) : null;
    return {
      orderId: o.id,
      code: `WO-${String(o.id).padStart(3, "0")}`,
      customer: o.customerName,
      product: o.productName,
      quantity: o.quantity,
      dispatched: done,
      remaining,
      progress: o.quantity ? done / o.quantity : 0,
      slowestStep: worst?.step ?? null,
      slowestStepId: worst?.stepId ?? null,
      slowestPace: worst ? r1(worst.pace) : null,
      projectedFinish: finish,
      noPace: !!worst && !Number.isFinite(worst.days),
      due,
      lateBy: lateBy != null && lateBy > 0 ? lateBy : 0,
      status: !due ? "nodue" : finish == null ? "unknown" : lateBy > 0 ? "late" : daysBetween(finish, due) <= 1 ? "tight" : "ok",
    };
  });
  list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
  return {
    orders: list,
    totalRemaining: list.reduce((s, o) => s + o.remaining, 0),
    totalQuantity: list.reduce((s, o) => s + o.quantity, 0),
    totalDispatched: list.reduce((s, o) => s + o.dispatched, 0),
    atRisk: list.filter((o) => o.status === "late").length,
  };
}

// ---------------------------------------------------------------- diagnosis
function diagnose(ctx) {
  const { prodWin, steps, machines, constraint, settings, feedback, windowDays, baseStep, forecast } = ctx;
  const F = [];
  const stepOf = new Map(steps.map((s) => [s.id, s]));
  const onC = (stepId) => constraint?.stepId === stepId;
  const vpp = settings.valuePerPiece;

  const push = (f) => {
    const rule = RULES[f.rule];
    const factor = learningFactor(feedback, f.rule);
    const conf = Math.min(0.98, (f.baseConf ?? rule.conf) * factor);
    const weight = f.weight ?? (f.stepId != null ? (onC(f.stepId) ? 1 : 0.5) : 1);
    const kind = f.kind || rule.kind;
    const bonus = kind === "Prediction" ? 400 : kind === "Data" ? 50 : kind === "Cost" ? 30 : 0;
    const score = ((f.recPcsPerDay || 0) + bonus) * weight * conf / Math.max(0.1, f.effortH);
    const key = `${f.rule}|${f.scope}`;
    const fb = feedback.find((x) => `${x.rule}|${x.scope}` === key);
    F.push({
      ...f,
      kind: f.kind || rule.kind,
      conf,
      weight,
      score,
      key,
      onConstraint: f.stepId != null && onC(f.stepId),
      recPcsPerDay: f.recPcsPerDay != null ? Math.round(f.recPcsPerDay) : null,
      recMinPerDay: f.recMinPerDay != null ? r1(f.recMinPerDay) : null,
      value: vpp && f.recPcsPerDay ? Math.round(f.recPcsPerDay * vpp) : null,
      feedback: fb ? { action: fb.action, by: fb.by, when: fb.createdAt } : null,
    });
  };

  // Per-machine rules.
  for (const m of machines) {
    const k = m.kpi;
    const b = m.baseline;
    const step = stepOf.get(m.stepId);
    const days = Math.max(1, k.days);
    const hrs = k.plannedMin / 60;
    const rate = k.ratePerHr || (m.std || 0); // units per run hour, to price lost minutes
    const label = m.machineId ? `${m.name} (${m.stepName})` : m.stepName;

    // R1 breakdown time above normal
    const normalDown = b?.ready && b.downPerPlannedHr != null ? b.downPerPlannedHr * hrs : null;
    const excess = normalDown != null ? k.downMin - normalDown : k.downMin - 0.05 * k.plannedMin; // no baseline: >5% of planned time
    const clearlyAbove = normalDown == null || k.downMin > normalDown * 1.5;
    if (k.nDown > 0 && excess / days > 20 && clearlyAbove) {
      const byR = new Map();
      prodWin.filter((e) => e.machineKey === m.key && e.downMin > 0).forEach((e) => {
        const r = (e.downReason || "No reason given").trim();
        const c = byR.get(r.toLowerCase()) || { r, min: 0, n: 0 };
        c.min += e.downMin; c.n += 1; byR.set(r.toLowerCase(), c);
      });
      const top = [...byR.values()].sort((a, c) => c.min - a.min)[0];
      push({
        rule: "breakdown", scope: `machine:${m.key}`, stepId: m.stepId, machine: label,
        title: `${label} lost ${n0(k.downMin)} minutes to breakdowns`,
        evidence: [
          `${k.nDown} breakdown${k.nDown === 1 ? "" : "s"}, mostly “${top.r}” (${n0(top.min)} min). ${normalDown != null ? `A normal period loses about ${n0(normalDown)} minutes here.` : "That is more than 5% of its planned time."}`,
          k.MTBF ? `Mean time between breakdowns is ${n1(k.MTBF)} running hours; mean repair time ${n0(k.MTTR)} min.` : null,
        ].filter(Boolean),
        action: actionForReason(top.r, label),
        recPcsPerDay: (Math.max(0, excess) * 0.6 / days / 60) * rate,
        recMinPerDay: Math.max(0, excess) * 0.6 / days,
        effortH: 1, effortTxt: "1 h with maintenance",
        metric: { kind: "down_per_day", key: m.key, label: "Breakdown min/day", value: r1(k.downPerDay) },
      });
    }

    // R2 repeat breakdown reason (3+ times in the window)
    const reasons = new Map();
    prodWin.filter((e) => e.machineKey === m.key && e.downMin > 0 && e.downReason).forEach((e) => {
      const r = e.downReason.trim();
      const c = reasons.get(r.toLowerCase()) || { r, min: 0, n: 0 };
      c.min += e.downMin; c.n += 1; reasons.set(r.toLowerCase(), c);
    });
    for (const c of reasons.values()) {
      if (c.n >= 3) {
        push({
          rule: "repeat", scope: `machine:${m.key}|${c.r.toLowerCase()}`, stepId: m.stepId, machine: label,
          title: `“${c.r}” stopped ${label} ${c.n} times`,
          evidence: [`The same reason came back ${c.n} times in this period and cost ${n0(c.min)} minutes. Repeats point to a root cause that a quick fix isn’t removing.`],
          action: `Do a 5-why on “${c.r}” with the operator and maintenance at ${label}, fix the root cause, and add it to the preventive maintenance checklist.`,
          recPcsPerDay: (c.min * 0.5 / days / 60) * rate,
          recMinPerDay: c.min * 0.5 / days,
          effortH: 2, effortTxt: "2 h root-cause review",
          metric: { kind: "reason_per_day", key: `${m.key}|${c.r.toLowerCase()}`, label: `“${c.r}” min/day`, value: r1(c.min / days) },
        });
      }
    }

    // R3 running below standard
    if (m.std && k.P != null && k.runMin > 60) {
      const normalSpeed = b?.ready && b.speedLossPerRunHr != null ? b.speedLossPerRunHr * (k.runMin / 60) : null;
      const excessSpeed = normalSpeed != null ? k.speedLossMin - normalSpeed : k.P < 0.85 ? k.speedLossMin - 0.15 * k.runMin : 0;
      const belowOwnNormal = !(b?.ready && b.P != null) || k.P < b.P - 0.04;
      if (excessSpeed / days > 30 && belowOwnNormal) {
        push({
          rule: "speed", scope: `machine:${m.key}`, stepId: m.stepId, machine: label,
          title: `${label} is running at ${Math.round(k.P * 100)}% of its standard rate`,
          evidence: [
            `It made ${n0(k.ratePerHr)} units per running hour against a standard of ${m.std}/hr. Slow running cost ${n0(k.speedLossMin)} minutes${normalSpeed != null ? `, ${n0(excessSpeed)} more than normal` : ""}, without any breakdown logged for it.`,
            b?.ready && b.ratePerHr ? `Its own normal rate is ${n0(b.ratePerHr)}/hr.` : `If ${m.std}/hr is not realistic for this step, correct the standard rate so the numbers stay honest.`,
          ],
          action: `Watch a cycle on ${label} with the operator: check feeds, fixtures and material handling between units. If the standard of ${m.std}/hr can’t be met on this machine, update it under Standard rates.`,
          recPcsPerDay: (Math.max(0, excessSpeed) * 0.5 / days / 60) * m.std,
          recMinPerDay: Math.max(0, excessSpeed) * 0.5 / days,
          effortH: 0.5, effortTxt: "30 min on the floor",
          metric: { kind: "perf", key: m.key, label: "Performance", value: r3(k.P) },
        });
      }
    }

    // R5 bits per 1,000 units above normal
    if (m.formType === "machining_bits" && k.bitsPer1000 != null && k.bits >= 2) {
      const nb = b?.ready ? b.bitsPer1000 : null;
      if (nb != null && k.bitsPer1000 > nb * 1.5 && k.bitsPer1000 - nb >= 0.5) {
        push({
          rule: "bits", scope: `machine:${m.key}`, stepId: m.stepId, machine: label,
          title: `${label} is using ${n1(k.bitsPer1000)} bits per 1,000 units`,
          evidence: [`Its normal is ${n1(nb)} per 1,000. ${k.bits} bits were changed in this period.`, `Faster bit wear usually comes from coolant, feed/speed settings, or a weak batch of bits.`],
          action: `Check coolant flow and the feed/speed on ${label}, and compare the current box of bits with the last good batch.`,
          recPcsPerDay: 0, effortH: 0.5, effortTxt: "30 min",
          kind: "Cost",
          metric: { kind: "bits_per_1000", key: m.key, label: "Bits per 1,000", value: r1(k.bitsPer1000) },
        });
      }
    }
  }

  // R4 rejections above normal, per QC step x product
  for (const s of steps.filter((x) => x.formType === "inspection" && x.kpi)) {
    const byProd = new Map();
    prodWin.filter((e) => e.processId === s.id).forEach((e) => {
      const c = byProd.get(e.productId) || { name: e.productName, good: 0, rej: 0, days: new Set() };
      c.good += e.good || 0; c.rej += e.rej || 0; c.days.add(e.day); byProd.set(e.productId, c);
    });
    const normal = baseStep.get(String(s.id))?.ready ? baseStep.get(String(s.id)).rejRate : null;
    for (const [pid, c] of byProd) {
      const total = c.good + c.rej;
      if (total < 200) continue;
      const rate = c.rej / total;
      const ref = normal ?? 0.02;
      if (rate > Math.max(ref * 1.5, ref + 0.01)) {
        const extra = c.rej - ref * total;
        const plating = s.name.toLowerCase().includes("plating");
        push({
          rule: "quality", scope: `step:${s.id}|${pid}`, stepId: s.id, machine: s.name,
          title: `${c.name}: ${pctTxt(rate)} rejected at ${s.name}`,
          evidence: [
            `${n0(c.rej)} of ${n0(total)} units rejected, against ${normal != null ? `a normal ${pctTxt(normal)}` : "a 2% guide (no history yet)"}. That is about ${n0(extra)} extra units scrapped.`,
            plating ? "These are plating rejections, so the cause is most likely at the plating vendor, not on our machines." : "These are measurement rejections, so the cause is upstream in machining (cutting, tip grinding, drilling or chamfer).",
          ],
          action: plating
            ? `Hold the remaining units from that plating batch, share the reject count and samples with the plating vendor, and ask for a corrective action.`
            : `Measure a sample of ${c.name} at each machining step to find where it drifts out of size, and check any setting changed recently on those machines.`,
          recPcsPerDay: extra / Math.max(1, c.days.size),
          effortH: plating ? 0.5 : 1, effortTxt: plating ? "30 min call" : "1 h measuring",
          metric: { kind: "rej_rate", key: `${s.id}|${pid}`, label: "Reject rate", value: r3(rate) },
        });
      }
    }
  }

  // R6 flow: work piling up at the constraint
  if (constraint?.reason === "queue") {
    const c = stepOf.get(constraint.stepId);
    if (c && c.queueDays > 1.5) {
      const idle = c.idleMachines;
      push({
        rule: "flow", scope: `step:${c.id}`, stepId: c.id, machine: c.name, weight: 1,
        title: `${n0(c.queue)} units are waiting at ${c.name}`,
        evidence: [
          Number.isFinite(c.queueDays)
            ? `That is about ${n1(c.queueDays)} days of work at its recent pace of ${n0(c.pacePerDay)} units/day. Everything after it can only go as fast as this step.`
            : `Nothing was logged at ${c.name} in the last 14 days, so this work isn’t moving.`,
          idle.length ? `${idle.length} of its ${c.machines.length} machines logged nothing in this period: ${idle.slice(0, 8).join(", ")}${idle.length > 8 ? "…" : ""}.` : `All of its machines are already logging work.`,
        ],
        action: idle.length
          ? `Put the idle ${c.name.toLowerCase()} machines (${idle.slice(0, 4).join(", ")}) on these orders, or add a shift at ${c.name}, before adding work anywhere else.`
          : `Add a shift or overtime at ${c.name}, and protect it from breakdowns and waiting for material — it sets the pace for every order.`,
        recPcsPerDay: c.pacePerDay ? c.pacePerDay * 0.3 : 0,
        effortH: 1, effortTxt: "1 shift decision",
        metric: { kind: "pace", key: String(c.id), label: `${c.name} units/day`, value: r1(c.kpi?.goodPerDay ?? c.pacePerDay) },
      });
    }
  }

  // R7 orders at risk
  for (const o of forecast.orders.filter((x) => x.status === "late").slice(0, 3)) {
    push({
      rule: "due", scope: `order:${o.orderId}`, stepId: o.slowestStepId, machine: o.code, weight: 1,
      title: `${o.code} (${o.product}) will miss its due date by about ${o.lateBy} day${o.lateBy === 1 ? "" : "s"}`,
      evidence: [
        `${n0(o.remaining)} of ${n0(o.quantity)} units still to dispatch. At the recent pace of ${n0(o.slowestPace)} units/day at ${o.slowestStep}, it finishes around ${fmtDay(o.projectedFinish)} against a due date of ${fmtDay(o.due)}.`,
      ],
      action: `Move ${o.code} to the front of the queue at ${o.slowestStep}, or tell ${o.customer} now about a new date.`,
      recPcsPerDay: 0, effortH: 0.25, effortTxt: "15 min",
    });
  }

  // R8 data: production steps logged without a standard rate
  const noStd = steps.filter((s) => s.production && s.kpi && !s.std);
  if (noStd.length) {
    push({
      rule: "rates", scope: "rates", kind: "Data",
      title: `${noStd.length} step${noStd.length === 1 ? " has" : "s have"} no standard rate`,
      evidence: [`${noStd.map((s) => s.name).join(", ")} ${noStd.length === 1 ? "has" : "have"} logs but no target units per hour, so Performance and OEE can’t be calculated there.`],
      action: `Open Standard rates on this page and enter the units per hour each step should make at full speed.`,
      recPcsPerDay: null, effortH: 0.25, effortTxt: "15 min",
    });
  }

  // R9 data: entries that look mistyped
  const odd = prodWin.filter((e) => (e.std && e.runMin > 30 && e.good / (e.runMin / 60) > 2.5 * e.std) || e.plannedMin > 14 * 60);
  if (odd.length) {
    push({
      rule: "entry", scope: "entries", kind: "Data",
      title: `${odd.length} shift log${odd.length === 1 ? " looks" : "s look"} mistyped`,
      evidence: [`${odd.slice(0, 3).map((e) => `${e.stepName}${e.machineName ? ` ${e.machineName}` : ""} on ${fmtDay(e.day)} by ${e.worker}`).join("; ")}${odd.length > 3 ? "…" : ""}: either more than 2.5× the standard rate or a shift longer than 14 hours. These skew the numbers.`],
      action: `Check these logs in the Production Log with the operators and correct the units or times.`,
      recPcsPerDay: null, effortH: 0.25, effortTxt: "15 min",
    });
  }

  F.sort((a, b) => b.score - a.score);
  return F;
}

function actionForReason(reason, where) {
  const r = reason.toLowerCase();
  if (/tool|die|punch|bit|insert|blade/.test(r)) return `Check tooling at ${where}: inspect the die/tool for wear, keep a sharpened spare ready at the machine, and log tool life so changes are planned, not reactive.`;
  if (/power|electric|supply|voltage/.test(r)) return `Note the times of the power cuts and raise them with the electrician or the supply company; consider a stabiliser or UPS for the controls on ${where}.`;
  if (/material|shortage|stock|raw/.test(r)) return `This is a planning loss, not a machine fault: have stores kit the material for ${where} before the shift starts.`;
  if (/mainten|service|oil|lubric/.test(r)) return `Move this maintenance to a planned slot (start of shift or weekend) so it stops eating into running time at ${where}.`;
  if (/no reason/.test(r)) return `Ask the ${where} operators to always pick a breakdown reason in the app; without it the agent can’t tell what to fix.`;
  return `Ask maintenance for the root cause of “${reason}” on ${where} and check that spares are on hand.`;
}
