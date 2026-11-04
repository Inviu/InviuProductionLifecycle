// "Ask the agent": Claude answers a manager's question by calling tools that
// read the same analytics engine as the page, so every figure comes from the
// logs. Runs server-side; needs ANTHROPIC_API_KEY. Without it the feature is off.

import { getOverview } from "./analytics.service.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 6;

export const agentEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

function systemPrompt(ov) {
  return `You are the efficiency agent for Inviu's production floor. The plant makes rod components (spindles: Cutting → Tip grinding → Drilling → Chamfer → Quality check → plating → Quality check after plating → Packing → Pallet → Dispatch) and sheet-metal parts (Blanking, Bending, Punching, Notching on power presses PP1–PP14, then plating, QC, packing, dispatch). Machines: TR1–TR4 cutting, BG1–BG3 tip grinding, DR1–DR13 drilling, CM1–CM2 chamfer, PP1–PP14 presses.
You help the production manager understand efficiency and decide what to do next. The period being viewed is ${ov.period.from} to ${ov.period.to}${ov.period.family ? `, ${ov.period.family} only` : ""}.
Always get figures by calling the tools; never invent numbers. Keep answers short and practical: lead with the answer, cite the specific figures, machines and breakdown reasons, and end with one concrete next step when it helps. Plain text, no markdown headings or tables. Use pieces, minutes and days${ov.settings.valuePerPiece ? `; one good piece is worth ₹${ov.settings.valuePerPiece}` : ""}.
OEE = Availability × Performance × Quality. Availability comes from logged breakdown time, Performance from pieces per running hour against the step's standard rate, Quality from QC rejections. The constraint is the step with the most days of work waiting in open work orders; time recovered there is worth the most. Logistics steps (plating moves, pallet, dispatch) are counts only and have no OEE. If data is missing (no standard rate, no history), say so plainly.`;
}

function buildTools(ov) {
  const stepByName = (name) => {
    const n = String(name || "").toLowerCase().trim();
    return ov.steps.find((s) => s.name.toLowerCase() === n) || ov.steps.find((s) => s.name.toLowerCase().includes(n));
  };
  const kpiOut = (k, b) =>
    k && {
      oee_pct: pct(k.OEE), availability_pct: pct(k.A), performance_pct: pct(k.P), quality_pct: pct(k.Q),
      normal_oee_pct: pct(b?.OEE), best_oee_pct: pct(b?.best), baseline_days: b?.days ?? 0,
      good_pieces: k.good, rejected: k.rej, pieces_per_running_hour: r1(k.ratePerHr), normal_pieces_per_hour: r1(b?.ratePerHr),
      breakdown_minutes: r1(k.downMin), breakdowns: k.nDown, mtbf_hours: r1(k.MTBF), mttr_minutes: r1(k.MTTR),
      slow_running_minutes: r1(k.speedLossMin), reject_rate_pct: pct(k.rejRate),
      bits_changed: k.bits, bits_per_1000: r1(k.bitsPer1000), normal_bits_per_1000: r1(b?.bitsPer1000), days_logged: k.days,
    };
  const steps = ov.steps.map((s) => s.name);
  return [
    {
      name: "get_plant_summary",
      description: "Plant-level status for the period: OEE and factors vs normal and best, good pieces, dispatched, the constraint step and why, open orders and how many are at risk.",
      input_schema: { type: "object", properties: {} },
      run: () => ({
        period: ov.period, ...kpiOut(ov.plant.kpi, ov.plant.baseline), target_oee_pct: pct(ov.settings.targetOee), world_class_oee_pct: 85,
        dispatched_pieces: ov.plant.dispatched, constraint: ov.constraint ? { step: ov.steps.find((s) => s.id === ov.constraint.stepId)?.name, why: ov.constraint.text } : null,
        open_orders: ov.forecast.orders.length, orders_at_risk: ov.forecast.atRisk, pieces_remaining_on_orders: ov.forecast.totalRemaining,
      }),
    },
    {
      name: "get_step_kpis",
      description: "KPIs for one process step compared with its normal (median of up to 20 previous days), plus its machines, idle machines, work waiting and standard rate.",
      input_schema: { type: "object", properties: { step: { type: "string", enum: steps } }, required: ["step"] },
      run: ({ step }) => {
        const s = stepByName(step);
        if (!s) return { error: `Unknown step. Use one of: ${steps.join(", ")}` };
        return {
          step: s.name, form: s.formType, standard_rate_per_hour: s.std, ...kpiOut(s.kpi, s.baseline),
          pieces_waiting_in_orders: s.queue, recent_pace_per_day: s.pacePerDay, days_of_work_waiting: Number.isFinite(s.queueDays) ? r1(s.queueDays) : "no recent output",
          machines: s.machines.map((m) => m.name), idle_machines_this_period: s.idleMachines,
        };
      },
    },
    {
      name: "get_machine_kpis",
      description: "KPIs for one machine by its code (e.g. DR3, TR1, PP7, CM2, BG1) compared with its own normal.",
      input_schema: { type: "object", properties: { machine: { type: "string" } }, required: ["machine"] },
      run: ({ machine }) => {
        const code = String(machine || "").toUpperCase().trim();
        const rows = ov.machines.filter((m) => (m.name || "").toUpperCase() === code);
        if (!rows.length) return { error: `${code} has no logs in this period.` };
        return rows.map((m) => ({ machine: m.name, step: m.stepName, standard_rate_per_hour: m.std, ...kpiOut(m.kpi, m.baseline) }));
      },
    },
    {
      name: "get_loss_pareto",
      description: "Biggest causes of lost minutes at one step this period (breakdown reasons with machines, slow running, rejects), largest first.",
      input_schema: { type: "object", properties: { step: { type: "string", enum: steps } }, required: ["step"] },
      run: ({ step }) => {
        const s = stepByName(step);
        return s ? ov.pareto[s.id] : { error: "Unknown step" };
      },
    },
    {
      name: "get_daily_trend",
      description: "Day-by-day OEE, good pieces, breakdown minutes, reject rate and bits per 1,000 for one step (or the whole plant if step is omitted), to see when a problem started.",
      input_schema: { type: "object", properties: { step: { type: "string", enum: steps } } },
      run: ({ step } = {}) => {
        const s = step ? stepByName(step) : null;
        const rows = s ? ov.daily[s.id] : ov.daily.plant;
        return rows.filter((d) => d.logged).map((d) => ({ day: d.day, oee_pct: pct(d.OEE), good: d.good, rejected: d.rej, breakdown_min: d.downMin, reject_rate_pct: pct(d.rejRate), bits_per_1000: d.bitsPer1000 }));
      },
    },
    {
      name: "get_findings",
      description: "The agent's ranked findings and recommended actions, with evidence, pieces recoverable per day, confidence, effort and any feedback already given.",
      input_schema: { type: "object", properties: {} },
      run: () =>
        ov.findings.slice(0, 8).map((f, i) => ({
          rank: i + 1, title: f.title, kind: f.kind, where: f.machine, on_constraint: f.onConstraint, evidence: f.evidence, action: f.action,
          pieces_recoverable_per_day: f.recPcsPerDay, value_per_day_rupees: f.value, confidence_pct: Math.round(f.conf * 100), effort: f.effortTxt,
          feedback: f.feedback?.action || null,
        })),
    },
    {
      name: "get_open_orders",
      description: "Open work orders with progress, slowest remaining step, projected finish date at recent pace, due date and whether they are at risk.",
      input_schema: { type: "object", properties: {} },
      run: () => ov.forecast.orders,
    },
  ];
}

async function callClaude(body, signal) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      res.status === 401
        ? "The Anthropic API key on the server isn’t valid. Check ANTHROPIC_API_KEY on Render."
        : json?.error?.message || `Claude API error ${res.status}`;
    throw Object.assign(new Error(res.status === 429 ? "Too many questions right now. Try again in a minute." : msg), { status: res.status === 429 ? 429 : 502, expose: true });
  }
  return json;
}

/**
 * @param {{messages: {role:'user'|'assistant', content:string}[], from?, to?, family?}} req
 * @returns {{answer:string, toolsUsed:string[]}}
 */
export async function ask({ messages, from, to, family }, signal) {
  if (!agentEnabled()) throw Object.assign(new Error("Ask the agent is not set up on the server."), { status: 503, expose: true });
  const ov = await getOverview({ from, to, family });
  const tools = buildTools(ov);
  const convo = messages.slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  const used = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callClaude(
      {
        model: MODEL,
        max_tokens: 1200,
        system: systemPrompt(ov),
        tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
        messages: convo,
      },
      signal
    );
    convo.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason !== "tool_use") {
      const answer = resp.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      return { answer: answer || "No answer came back. Try asking more simply.", toolsUsed: used };
    }
    const results = [];
    for (const c of resp.content.filter((x) => x.type === "tool_use")) {
      const t = tools.find((x) => x.name === c.name);
      let out;
      try {
        out = t ? t.run(c.input || {}) : { error: "Unknown tool" };
      } catch (e) {
        out = { error: e.message };
      }
      used.push(c.name.replace(/_/g, " ") + (c.input?.step ? ` (${c.input.step})` : c.input?.machine ? ` (${c.input.machine})` : ""));
      results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) });
    }
    convo.push({ role: "user", content: results });
  }
  return { answer: "That needed too many lookups. Try a narrower question.", toolsUsed: used };
}
