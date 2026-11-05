import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { ArrowLeft, LogOut, RefreshCw, Loader, Settings, X, Send, Square } from "lucide-react";

// ------------------------------------------------------------------ formatting
const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const n0 = (x) => (x == null ? "—" : Math.round(x).toLocaleString("en-IN"));
const n1 = (x) => (x == null ? "—" : (Math.round(x * 10) / 10).toLocaleString("en-IN", { maximumFractionDigits: 1 }));
const pad = (n) => String(n).padStart(2, "0");
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDay = (s, n) => {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (s) => `${+s.slice(8)} ${MONTHS[+s.slice(5, 7) - 1]}`;
const statusColor = (st) => (st === "ok" ? "var(--ok)" : st === "warn" ? "var(--warn)" : st === "bad" ? "var(--bad)" : "var(--belt)");
const statusWord = { ok: "Normal", warn: "Below normal", bad: "Well below normal", none: "No data yet" };

const PERIODS = [
  { id: "today", label: "Today", range: (t) => [t, t] },
  { id: "yesterday", label: "Yesterday", range: (t) => [shiftDay(t, -1), shiftDay(t, -1)] },
  { id: "7d", label: "7 days", range: (t) => [shiftDay(t, -6), t] },
  { id: "30d", label: "30 days", range: (t) => [shiftDay(t, -29), t] },
];
const FAMILIES = [
  { id: "", label: "All products" },
  { id: "Rod components", label: "Rod components" },
  { id: "Sheet metal", label: "Sheet metal" },
];
const SHORT = { "Quality check (after plating)": "QC after plating", "Quality check": "Quality check" };
const short = (name) => SHORT[name] || name;

// Floor order: each family's routing in sequence (Rod first, then Sheet metal), shared steps once.
function stepOrder(data) {
  const fams = [...new Set(data.steps.flatMap((s) => Object.keys(s.lines || {})))].sort();
  const order = [];
  for (const f of fams) {
    data.steps
      .filter((s) => s.lines?.[f] != null)
      .sort((a, b) => a.lines[f] - b.lines[f])
      .forEach((s) => !order.includes(s.id) && order.push(s.id));
  }
  data.steps.forEach((s) => !order.includes(s.id) && order.push(s.id));
  return order;
}

const KIND_PILL = { Availability: "info", Performance: "info", Quality: "info", Flow: "warn", Prediction: "warn", Cost: "info", Data: "none" };

function remember(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function store(key, v) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

// ================================================================== page
export const AgentPage = () => {
  const { navigateTo, logout } = useApp();
  const [period, setPeriod] = useState(() => remember("agent.period", "7d"));
  const [family, setFamily] = useState(() => remember("agent.family", ""));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [animate, setAnimate] = useState(true);

  const range = useMemo(() => PERIODS.find((p) => p.id === period).range(localDay(new Date())), [period]);

  const load = async (anim = false) => {
    try {
      setLoading(true);
      setError(null);
      const ov = await api.agent.overview({ from: range[0], to: range[1], family });
      setData(ov);
      setAnimate(anim);
      setSel((cur) => {
        const ids = ov.steps.filter((s) => s.production).map((s) => s.id);
        if (cur && ids.includes(cur)) return cur;
        const firstFinding = ov.findings.find((f) => f.stepId && ids.includes(f.stepId));
        return firstFinding?.stepId ?? ov.constraint?.stepId ?? ids[0] ?? null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    store("agent.period", period);
    store("agent.family", family);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, family]);

  const giveFeedback = async (f, action) => {
    try {
      await api.agent.feedback({ rule: f.rule, scope: f.scope, title: f.title, action, metric: f.metric ?? null });
      await load(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="agent min-h-screen">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-5 pt-5 pb-16">
        {/* ---------------------------------------------------- header */}
        <header className="flex flex-wrap gap-4 items-end justify-between pb-4" style={{ borderBottom: "2px solid var(--ink)" }}>
          <div className="flex items-start gap-2">
            <button onClick={() => navigateTo("home")} className="p-2 -ml-2 rounded hover:bg-black/5" aria-label="Back to work orders">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="cond text-3xl font-semibold leading-none">Efficiency agent</h1>
              <p className="muted mt-1 text-sm">
                Inviu floor · {range[0] === range[1] ? shortDay(range[0]) : `${shortDay(range[0])} – ${shortDay(range[1])}`}
                {data?.freshness ? ` · logs up to ${fmtStamp(data.freshness)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 items-end">
            <Seg label="Period" options={PERIODS} value={period} onChange={setPeriod} />
            <Seg label="Products" options={FAMILIES} value={family} onChange={setFamily} />
            <div className="flex gap-2">
              <button className="btn flex items-center gap-1.5" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" /> Settings
              </button>
              <button className="btn flex items-center gap-1.5" onClick={() => load(false)} aria-label="Refresh">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button className="btn flex items-center gap-1.5" onClick={logout} aria-label="Log out">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {error && <div className="mt-4 px-4 py-3 rounded" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>{error}</div>}

        {!data && loading ? (
          <div className="flex justify-center py-24"><Loader className="w-8 h-8 animate-spin" style={{ color: "var(--steel)" }} /></div>
        ) : data ? (
          <>
            <Floor data={data} sel={sel} onSelect={setSel} />

            <div className="grid gap-5 mt-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <Briefing data={data} onFeedback={giveFeedback} onSelect={setSel} />
              <aside className="panel p-5 self-start">
                <Pipeline steps={data.pipeline} animate={animate} />
                <Forecast forecast={data.forecast} />
              </aside>
            </div>

            <StepDetail data={data} sel={sel} onSelect={setSel} />
            <KpiTable data={data} sel={sel} onSelect={setSel} />
            <AskAgent data={data} range={range} family={family} />
            <Learning data={data} onReset={async () => { await api.agent.resetLearning(); load(false); }} />

            <footer className="mt-10 pt-4 text-sm muted max-w-[92ch]" style={{ borderTop: "1px solid var(--line)" }}>
              Built from what the floor logs in the app: shift times, units, breakdown time and reason, bit changes and QC rejections, plus open work orders
              and the standard rate per step. OEE = Availability (running time ÷ planned time) × Performance (units ÷ what the standard rate allows in the
              running time) × Quality (good ÷ inspected, from the QC steps). “Normal” is the median of the previous 20 days with logs; “best” is their 90th
              percentile. The constraint is the step with the most days of work waiting in open orders. Plating, pallet and dispatch are untimed moves, so they
              have counts but no OEE. Not measured here (unlike a PLC-fed line): stops shorter than a logged breakdown, changeover time, and machine sensors such
              as vibration — short stops show up inside “slow running”. World-class OEE is 85% (A 90%, P 95%, Q 99.9%).
            </footer>
          </>
        ) : null}
      </div>

      {showSettings && data && (
        <SettingsDrawer
          data={data}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            load(false);
          }}
        />
      )}
    </div>
  );
};

const fmtStamp = (iso) => {
  // Shift times are stored as the clock time the operator entered (as UTC).
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const Seg = ({ label, options, value, onChange }) => (
  <div>
    <div className="text-xs muted mb-1">{label}</div>
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

// ================================================================== floor schematic
function Floor({ data, sel, onSelect }) {
  const families = Object.keys(
    data.steps.reduce((acc, s) => {
      Object.keys(s.lines || {}).forEach((f) => (acc[f] = 1));
      return acc;
    }, {})
  ).sort();
  const findingSteps = new Set(data.findings.map((f) => f.stepId).filter(Boolean));
  const famHas = (fam, pid) => data.steps.find((s) => s.id === pid)?.lines?.[fam] != null;

  return (
    <section className="panel mt-5 px-3 pt-3 pb-2 overflow-x-auto" aria-label="Floor layout with OEE per step">
      {families.length === 0 && <p className="muted p-3">No routings found.</p>}
      {families.map((fam) => {
        const all = data.steps.filter((s) => s.lines?.[fam] != null).sort((a, b) => a.lines[fam] - b.lines[fam]);
        const prod = all.filter((s) => s.production && s.formType !== "packing");
        // Where plating sits: after the last machining/QC step that precedes "Waiting for plating".
        const platePos = all.find((s) => s.name === "Waiting for plating")?.lines[fam];
        const before = prod.filter((s) => platePos == null || s.lines[fam] < platePos);
        const after = prod.filter((s) => platePos != null && s.lines[fam] > platePos);
        const plateSteps = all.filter((s) => ["Waiting for plating", "In plating", "Received from plating"].includes(s.name));
        const packing = all.find((s) => s.formType === "packing");
        return (
          <div key={fam} className="mb-2">
            <div className="flex items-baseline justify-between px-2 pb-1">
              <h2 className="cond text-lg font-semibold">{fam}</h2>
              <span className="text-xs muted">Work flows left to right. Select a step to see its losses.</span>
            </div>
            <div className="flex items-stretch gap-0 min-w-max pb-2 relative">
              <Belt />
              {before.map((s) => (
                <StepBox key={s.id} s={s} sel={sel === s.id} isC={data.constraint?.stepId === s.id} hasF={findingSteps.has(s.id)} onSelect={onSelect} />
              ))}
              {plateSteps.length > 0 && famHas(fam, plateSteps[0].id) && <PlatingBox steps={plateSteps} />}
              {after.map((s) => (
                <StepBox key={s.id} s={s} sel={sel === s.id} isC={data.constraint?.stepId === s.id} hasF={findingSteps.has(s.id)} onSelect={onSelect} />
              ))}
              {packing && <StepBox s={packing} sel={sel === packing.id} isC={false} hasF={findingSteps.has(packing.id)} onSelect={onSelect} />}
              <EndNode fam={data.families?.[fam]} />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap justify-between gap-2 text-xs muted px-2 pb-1">
        <span>
          Top-bar colour compares each step with its own normal (or the {pct(data.settings.targetOee, 0)} target until there is history). A, P, Q bars span 60–100%.
        </span>
        <span className="flex items-center gap-3">
          <Dot c="var(--ok)" /> normal <Dot c="var(--warn)" /> below <Dot c="var(--bad)" /> well below
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "var(--warn)" }} /> agent finding
        </span>
      </div>
    </section>
  );
}
const Dot = ({ c }) => <span className="inline-block w-3 h-1.5" style={{ background: c }} />;
const Belt = () => (
  <svg className="absolute left-0 right-0 pointer-events-none" style={{ top: 64, height: 8, width: "100%" }} aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 8">
    <line x1="0" y1="4" x2="100" y2="4" stroke="var(--belt)" strokeWidth="8" strokeDasharray="0.4 1.6" vectorEffect="non-scaling-stroke" />
  </svg>
);

function StepBox({ s, sel, isC, hasF, onSelect }) {
  const k = s.kpi;
  const col = statusColor(s.status);
  const active = s.machines.filter((m) => m.active).length;
  return (
    <div className="relative flex flex-col items-center mx-1 z-[1]" style={{ width: 128 }}>
      <button
        onClick={() => onSelect(s.id)}
        aria-pressed={sel}
        aria-label={`${s.name}, OEE ${pct(k?.OEE)}`}
        className="text-left w-full rounded-[3px] overflow-hidden"
        style={{ background: "var(--surface)", border: sel ? "2.5px solid var(--ink)" : "1.2px solid var(--line)", height: 132 }}
      >
        <div style={{ height: 6, background: col }} />
        <div className="px-3 pt-1.5">
          <div className="flex justify-between items-baseline gap-1">
            <span className="font-semibold text-[13.5px] leading-tight truncate" title={s.name}>{short(s.name)}</span>
            {s.machines.length > 0 && <span className="cond text-xs muted whitespace-nowrap">{active}/{s.machines.length}</span>}
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="cond font-semibold leading-none" style={{ fontSize: 28, color: k?.OEE == null ? "var(--muted)" : col }}>
              {k?.OEE == null ? "—" : (k.OEE * 100).toFixed(1)}
              {k?.OEE != null && <span style={{ fontSize: 16 }}>%</span>}
            </span>
            <span className="text-[10px] muted">OEE</span>
          </div>
          {k ? (
            <div className="mt-1.5 space-y-[3px]">
              {[["A", k.A], ["P", k.P], ["Q", k.Q]].map(([lab, v]) => (
                <div key={lab} className="flex items-center gap-1.5">
                  <span className="cond text-[11px] muted w-2">{lab}</span>
                  <span className="flex-1 h-[6px]" style={{ background: "var(--sunk)" }}>
                    <span className="block h-full" style={{ width: `${v == null ? 0 : Math.max(0, Math.min(1, (v - 0.6) / 0.4)) * 100}%`, background: "var(--steel)" }} />
                  </span>
                  <span className="cond text-[11px] w-6 text-right">{v == null ? "—" : Math.round(v * 100)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] muted mt-2 leading-tight">No logs in this period</p>
          )}
          {k && s.std == null && <p className="text-[10px] mt-0.5" style={{ color: "var(--warn)" }}>Set a standard rate for P</p>}
        </div>
      </button>
      {hasF && <span className="absolute w-2.5 h-2.5 rounded-full" style={{ right: -3, top: -3, background: "var(--warn)", border: "2px solid var(--surface)" }} title="The agent has a finding here" />}
      <div className="text-center mt-1 min-h-[30px] leading-tight">
        {s.queue > 0 && <div className="cond text-[13px]">{n0(s.queue)} waiting</div>}
        {isC && <div className="text-[11px] font-semibold">Constraint</div>}
      </div>
    </div>
  );
}

function PlatingBox({ steps }) {
  const counts = steps.map((s) => ({ name: s.name.replace(" from plating", "").replace(" for plating", "").replace(" plating", ""), good: s.kpi?.good ?? 0, queue: s.queue }));
  return (
    <div className="relative mx-1 z-[1] flex flex-col items-center" style={{ width: 104 }}>
      <div className="w-full rounded-[3px] px-2.5 py-2" style={{ background: "var(--sunk)", border: "1.2px dashed var(--belt)", height: 132 }}>
        <div className="font-semibold text-[13px]">Plating</div>
        <div className="text-[10px] muted mb-1">vendor · not timed</div>
        {counts.map((c) => (
          <div key={c.name} className="flex justify-between text-[11px]">
            <span className="muted">{c.name}</span>
            <span className="cond">{n0(c.good)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EndNode({ fam }) {
  return (
    <div className="relative mx-1 z-[1] flex flex-col items-center" style={{ width: 84 }}>
      <div className="w-full rounded-[3px] text-center flex flex-col justify-center" style={{ background: "var(--ink)", color: "var(--bg)", height: 132 }}>
        <div className="text-[11px]">Line OEE</div>
        <div className="cond font-bold text-2xl leading-tight">{fam?.OEE == null ? "—" : (fam.OEE * 100).toFixed(1)}</div>
        <div className="mx-auto my-1" style={{ width: 42, height: 4, background: statusColor(fam?.status) }} />
        <div className="cond text-xs">{n0(fam?.dispatched ?? 0)}</div>
        <div className="text-[10px] opacity-80">dispatched</div>
      </div>
    </div>
  );
}

// ================================================================== briefing
function Briefing({ data, onFeedback, onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const p = data.plant;
  const list = showAll ? data.findings : data.findings.slice(0, 5);
  return (
    <section className="panel p-5" aria-labelledby="briefTitle">
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <h2 id="briefTitle" className="cond text-2xl font-semibold">Briefing</h2>
        <span className={`pill ${p.status}`}>{statusWord[p.status]}</span>
      </div>
      <p className="text-[1.15rem] font-semibold leading-snug mt-2 mb-1 max-w-[62ch]">{data.headline}</p>
      <div className="flex flex-wrap gap-x-7 gap-y-2 my-3 py-3" style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <Stat v={pct(p.kpi.OEE)} k="Plant OEE" />
        <Stat v={p.baseline?.ready ? pct(p.baseline.OEE) : "—"} k={p.baseline?.days ? `Normal (median of ${p.baseline.days} days)` : "Normal (no history yet)"} />
        <Stat v={p.baseline?.ready ? pct(p.baseline.best) : "—"} k="Best demonstrated" />
        <Stat v={pct(data.settings.targetOee, 0)} k="Target" />
        <Stat v={n0(p.dispatched)} k="Units dispatched" />
      </div>
      {data.findings.length === 0 ? (
        <p className="muted py-3">No recommendations. The agent flags anything that drifts outside each step’s normal range, work piling up, or orders at risk.</p>
      ) : (
        <ol className="list-none p-0 m-0">
          {list.map((f, i) => (
            <Action key={f.key} f={f} rank={i + 1} vpp={data.settings.valuePerPiece} onFeedback={onFeedback} onSelect={onSelect} />
          ))}
        </ol>
      )}
      {data.findings.length > 5 && (
        <button className="btn mt-3" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show top 5" : `Show all ${data.findings.length} findings`}
        </button>
      )}
    </section>
  );
}

const Stat = ({ v, k }) => (
  <div>
    <div className="cond text-[1.7rem] font-semibold leading-none">{v}</div>
    <div className="text-xs muted mt-0.5">{k}</div>
  </div>
);

function Action({ f, rank, vpp, onFeedback, onSelect }) {
  const [busy, setBusy] = useState(false);
  const act = async (a) => {
    setBusy(true);
    await onFeedback(f, a);
    setBusy(false);
  };
  return (
    <li className="grid gap-x-3 py-4" style={{ gridTemplateColumns: "38px 1fr", borderTop: rank === 1 ? "none" : "1px solid var(--line)" }}>
      <div className="cond text-[1.9rem] font-bold leading-none" style={{ color: rank === 1 ? "var(--ok)" : "var(--muted)" }}>{rank}</div>
      <div>
        <h3 className="font-semibold text-[1.03rem] leading-snug">{f.title}</h3>
        <div className="flex flex-wrap gap-1.5 my-1.5">
          <span className={`pill ${KIND_PILL[f.kind] || "info"}`}>{f.kind}</span>
          {f.machine && (
            <button className="pill info" onClick={() => f.stepId && onSelect(f.stepId)} title="Show this step below">
              {f.machine}
            </button>
          )}
          {f.onConstraint && <span className="pill warn">On the constraint</span>}
        </div>
        {f.evidence.map((e, i) => (
          <p key={i} className="text-[.94rem] my-1 max-w-[70ch]">{e}</p>
        ))}
        <div className="text-[.94rem] my-2 px-3 py-2" style={{ background: "var(--sunk)", borderLeft: "3px solid var(--ok)" }}>
          <b className="font-semibold">Do this:</b> {f.action}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[.86rem] muted">
          {f.kind === "Data" ? (
            <span>Better data, not direct output</span>
          ) : f.recPcsPerDay ? (
            <>
              <span>Recovers about <strong className="cond text-[1.05rem]" style={{ color: "var(--ink)" }}>{n0(f.recPcsPerDay)}</strong> units/day</span>
              {f.recMinPerDay ? <span><strong className="cond text-[1.05rem]" style={{ color: "var(--ink)" }}>{n0(f.recMinPerDay)}</strong> min/day</span> : null}
              {vpp ? <span><strong className="cond text-[1.05rem]" style={{ color: "var(--ink)" }}>₹{n0(f.value)}</strong>/day</span> : null}
            </>
          ) : null}
          <span>Confidence <strong className="cond text-[1.05rem]" style={{ color: "var(--ink)" }}>{Math.round(f.conf * 100)}%</strong></span>
          <span>Effort <strong className="cond text-[1.05rem]" style={{ color: "var(--ink)" }}>{f.effortTxt}</strong></span>
        </div>
        <div className="flex flex-wrap gap-2 mt-2.5">
          {f.feedback?.action === "done" ? (
            <span className="text-sm font-semibold" style={{ color: "var(--ok)" }}>
              Marked done{f.feedback.by ? ` by ${f.feedback.by}` : ""}. The agent will show the result under “What the agent has learned”.
            </span>
          ) : f.feedback?.action === "rejected" ? (
            <span className="text-sm font-semibold muted">Marked not the cause. This rule now carries less weight.</span>
          ) : (
            <>
              <button className="btn primary" disabled={busy} onClick={() => act("done")}>Mark done</button>
              <button className="btn" disabled={busy} onClick={() => act("rejected")}>Not the cause</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

// ================================================================== pipeline + forecast
function Pipeline({ steps, animate }) {
  const [shown, setShown] = useState(animate ? 0 : steps.length);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce) {
      setShown(steps.length);
      return;
    }
    setShown(0);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= steps.length) clearInterval(t);
    }, 260);
    return () => clearInterval(t);
  }, [steps, animate]);
  return (
    <>
      <h2 className="cond text-2xl font-semibold">How the agent got there</h2>
      <ol className="list-none p-0 mt-3">
        {steps.map((s, i) => (
          <li key={s.t} className={`relative flex gap-2.5 py-2 ${i < shown ? "pipe-on" : i === shown ? "pipe-run" : ""}`}>
            {i < steps.length - 1 && <span className="absolute" style={{ left: 10, top: 30, bottom: -8, width: 2, background: "var(--line)" }} />}
            <span className="pipe-dot">✓</span>
            <div>
              <div className="font-semibold text-[.95rem] leading-tight">{s.t}</div>
              <div className="text-[.84rem] muted" style={{ visibility: i < shown ? "visible" : "hidden" }}>{s.d}</div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function Forecast({ forecast }) {
  const fc = forecast;
  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
      <h3 className="cond text-xl font-semibold">Order forecast</h3>
      {fc.orders.length === 0 ? (
        <p className="text-sm muted mt-1">No open work orders. Create one on the Work Orders page to see projected finish dates against due dates.</p>
      ) : (
        <>
          <p className="text-sm muted mt-1">
            {n0(fc.totalDispatched)} of {n0(fc.totalQuantity)} units dispatched across {fc.orders.length} open order{fc.orders.length === 1 ? "" : "s"}
            {fc.atRisk ? <>, <b style={{ color: "var(--bad)" }}>{fc.atRisk} at risk</b></> : ""}.
          </p>
          <ul className="list-none p-0 mt-2">
            {fc.orders.map((o) => (
              <li key={o.orderId} className="py-2" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="flex justify-between gap-2 items-baseline">
                  <span className="font-semibold text-sm">{o.code} <span className="font-normal muted">{o.customer}</span></span>
                  <span className={`pill ${o.status === "late" ? "bad" : o.status === "tight" ? "warn" : o.status === "ok" ? "ok" : "none"}`}>
                    {o.status === "late" ? `${o.lateBy} day${o.lateBy === 1 ? "" : "s"} late` : o.status === "tight" ? "Tight" : o.status === "ok" ? "On track" : o.status === "nodue" ? "No due date" : "Can’t tell yet"}
                  </span>
                </div>
                <div className="text-xs muted truncate">{o.product}</div>
                <div className="h-2.5 mt-1.5 relative" style={{ background: "var(--sunk)" }}>
                  <span className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, o.progress * 100)}%`, background: "var(--ok)" }} />
                </div>
                <div className="flex justify-between text-xs muted mt-1">
                  <span>{n0(o.dispatched)} / {n0(o.quantity)} dispatched</span>
                  <span>
                    {o.projectedFinish ? `finish ~${shortDay(o.projectedFinish)}` : o.noPace ? `no recent output at ${o.slowestStep}` : ""}
                    {o.due ? ` · due ${shortDay(o.due)}` : ""}
                  </span>
                </div>
                {o.slowestStep && o.projectedFinish && <div className="text-[11px] muted">paced by {o.slowestStep} at {n0(o.slowestPace)}/day</div>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] muted mt-1">{fc.note}</p>
        </>
      )}
    </div>
  );
}

// ================================================================== step detail
function StepDetail({ data, sel, onSelect }) {
  const order = stepOrder(data);
  const prodSteps = data.steps.filter((s) => s.production).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const s = data.steps.find((x) => x.id === sel);
  return (
    <section className="mt-7" aria-labelledby="detTitle">
      <div className="flex flex-wrap gap-3 items-baseline justify-between mb-3">
        <h2 id="detTitle" className="cond text-2xl font-semibold">Step detail</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose step">
          {prodSteps.map((x) => (
            <button
              key={x.id}
              onClick={() => onSelect(x.id)}
              aria-pressed={sel === x.id}
              className="rounded-full px-3 py-1 text-sm"
              style={sel === x.id ? { background: "var(--ink)", color: "var(--bg)", border: "1px solid var(--ink)" } : { background: "var(--surface)", border: "1px solid var(--line)" }}
            >
              {x.name}
            </button>
          ))}
        </div>
      </div>
      {!s ? (
        <p className="muted">Pick a step.</p>
      ) : !s.kpi ? (
        <div className="panel p-5 muted">Nothing logged at {s.name} in this period.</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="panel p-5"><Waterfall s={s} /></div>
          <div className="panel p-5"><Pareto rows={data.pareto[s.id] || []} /></div>
          <div className="panel p-5"><DailyOee rows={data.daily[s.id]} base={s.baseline} target={data.settings.targetOee} /></div>
          <div className="panel p-5"><Signal s={s} rows={data.daily[s.id]} /></div>
        </div>
      )}
    </section>
  );
}

function Waterfall({ s }) {
  const k = s.kpi;
  const segs = [
    ["Productive", k.productiveMin, "var(--ok)"],
    ["Breakdowns", k.downMin, "var(--bad)"],
    ["Slow running", k.speedLossMin, "var(--steel)"],
    ["Rejects", k.qualLossMin, "var(--muted)"],
  ];
  if (k.unclassifiedMin > 0.5) segs.push(["No standard rate", k.unclassifiedMin, "var(--belt)"]);
  const tot = segs.reduce((a, x) => a + (x[1] || 0), 0) || 1;
  const W = 560, rowH = 34, L = 140, BW = W - L - 80;
  let acc = 0;
  const b = s.baseline;
  return (
    <>
      <h3 className="cond text-lg font-semibold">Where the planned time went</h3>
      <p className="text-sm muted mb-2">{s.name}: {n0(k.plannedMin)} planned machine-minutes over {k.days} day{k.days === 1 ? "" : "s"}</p>
      <svg viewBox={`0 0 ${W} ${segs.length * rowH + 6}`} className="w-full h-auto" role="img" aria-label="Time loss waterfall">
        {segs.map(([lab, v, c], i) => {
          const y = 2 + i * rowH;
          const x0 = L + (i === 0 ? 0 : acc / tot) * BW;
          const w = Math.max(1, ((v || 0) / tot) * BW);
          acc += v || 0;
          return (
            <g key={lab}>
              <text x="0" y={y + 19} fontSize="13" fill="var(--ink)">{lab}</text>
              <rect x={L} y={y + 4} width={BW} height="20" fill="var(--sunk)" />
              <rect x={x0} y={y + 4} width={w} height="20" fill={c} />
              <text x={W} y={y + 19} textAnchor="end" className="cond" fontSize="15" fontWeight="600" fill="var(--ink)">{v == null ? "—" : `${n0(v)} min`}</text>
            </g>
          );
        })}
      </svg>
      <div className="grid gap-x-5 gap-y-2.5 mt-3 text-[.9rem]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Formula label="Availability" v={pct(k.A)} sub={`${n0(k.runMin)} run ÷ ${n0(k.plannedMin)} planned min`} />
        <Formula label="Performance" v={pct(k.P)} sub={s.std ? `${n0(k.good + k.rej)} units ÷ (${s.std}/hr × run time)` : "needs a standard rate"} />
        <Formula label="Quality" v={pct(k.Q, 2)} sub={k.rej ? `${n0(k.good)} good ÷ ${n0(k.good + k.rej)} inspected` : "no rejections logged at this step"} />
        <Formula label="OEE" v={pct(k.OEE)} sub={b?.ready ? `normal ${pct(b.OEE)}, best ${pct(b.best)}` : `history: ${b?.days ?? 0} of 20 days`} />
      </div>
    </>
  );
}
const Formula = ({ label, v, sub }) => (
  <div className="pl-2.5" style={{ borderLeft: "2px solid var(--line)" }}>
    {label} <b className="cond text-[1.1rem] font-semibold">{v}</b>
    <br />
    <span className="muted text-[.82rem]">{sub}</span>
  </div>
);

function Pareto({ rows }) {
  return (
    <>
      <h3 className="cond text-lg font-semibold">Biggest losses by cause</h3>
      <p className="text-sm muted mb-2">Lost minutes in this period</p>
      {!rows.length ? (
        <p className="muted py-3">No losses recorded.</p>
      ) : (
        (() => {
          const max = rows[0].minutes || 1;
          const W = 560, rowH = 30, L = 230;
          return (
            <svg viewBox={`0 0 ${W} ${rows.length * rowH + 6}`} className="w-full h-auto" role="img" aria-label="Loss Pareto">
              {rows.map((r, i) => {
                const y = i * rowH + 2;
                const w = (r.minutes / max) * (W - L - 70);
                const label = r.machines?.length ? `${r.cause} (${r.machines.slice(0, 3).join(", ")})` : r.cause;
                return (
                  <g key={r.cause}>
                    <text x="0" y={y + 18} fontSize="12.5" fill="var(--ink)">
                      <title>{label}</title>
                      {label.length > 34 ? `${label.slice(0, 33)}…` : label}
                    </text>
                    <rect x={L} y={y + 5} width={Math.max(1, w)} height="17" fill={i === 0 ? "var(--warn)" : r.type === "breakdown" ? "var(--steel)" : "var(--belt)"} />
                    <text x={L + w + 6} y={y + 18} className="cond" fontSize="14" fontWeight="600" fill="var(--ink)">{n0(r.minutes)}</text>
                  </g>
                );
              })}
            </svg>
          );
        })()
      )}
    </>
  );
}

// Day-by-day line chart helper.
function DayChart({ rows, value, yMin, yMax, ticks, fmt, refLines = [], color = "var(--ok)", dotColor, bars = false, aria }) {
  const W = 560, H = 220, L = 42, R = 10, T = 12, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const n = rows.length;
  const X = (i) => L + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const pts = rows.map((r, i) => ({ i, r, v: value(r) })).filter((p) => p.v != null);
  const every = Math.max(1, Math.ceil(n / 7));
  const bw = Math.max(4, Math.min(28, (iw / Math.max(1, n)) * 0.6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={aria}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="var(--line)" />
          <text x={L - 6} y={Y(t) + 4} textAnchor="end" className="cond" fontSize="12" fill="var(--muted)">{fmt(t)}</text>
        </g>
      ))}
      {rows.map((r, i) => (!r.logged ? <rect key={`g${i}`} x={X(i) - bw / 2} y={T} width={bw} height={ih} fill="var(--sunk)" opacity=".7" /> : null))}
      {refLines.map((rl) => (
        <line key={rl.label} x1={L} x2={W - R} y1={Y(rl.v)} y2={Y(rl.v)} stroke={rl.color} strokeDasharray={rl.dash} strokeWidth="1.3">
          <title>{rl.label}</title>
        </line>
      ))}
      {bars
        ? pts.map((p) => (
            <rect key={p.i} x={X(p.i) - bw / 2} y={Y(Math.min(yMax, p.v))} width={bw} height={Math.max(0, Y(yMin) - Y(Math.min(yMax, p.v)))} fill={dotColor ? dotColor(p.v) : color}>
              <title>{`${shortDay(p.r.day)}: ${fmt(p.v)}`}</title>
            </rect>
          ))
        : pts.length > 0 && (
            <>
              <polyline fill="none" stroke={color} strokeWidth="2.5" points={pts.map((p) => `${X(p.i)},${Y(Math.max(yMin, Math.min(yMax, p.v)))}`).join(" ")} />
              {pts.map((p) => (
                <circle key={p.i} cx={X(p.i)} cy={Y(Math.max(yMin, Math.min(yMax, p.v)))} r="3.8" fill={dotColor ? dotColor(p.v) : color}>
                  <title>{`${shortDay(p.r.day)}: ${fmt(p.v)}`}</title>
                </circle>
              ))}
            </>
          )}
      {rows.map((r, i) =>
        i % every === 0 || i === n - 1 ? (
          <text key={`x${i}`} x={X(i)} y={H - 8} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="cond" fontSize="12" fill="var(--muted)">
            {shortDay(r.day)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function DailyOee({ rows, base, target }) {
  const vals = rows.map((r) => r.OEE).filter((v) => v != null);
  const normal = base?.ready ? base.OEE : null;
  const lo = Math.min(0.4, Math.floor(Math.min(1, ...vals, normal ?? 1) * 5) / 5);
  const ref = normal ?? target;
  return (
    <>
      <h3 className="cond text-lg font-semibold">OEE day by day</h3>
      <p className="text-sm muted mb-2">
        {normal != null ? `Dashed line is this step’s normal (${pct(normal)}).` : `Dashed line is the ${pct(target, 0)} target (no history yet).`} Faint line is world-class 85%. Grey = no logs that day.
      </p>
      {vals.length === 0 ? (
        <p className="muted py-3">No OEE yet — this step needs a standard rate and logs.</p>
      ) : (
        <DayChart
          rows={rows}
          value={(r) => r.OEE}
          yMin={lo}
          yMax={1}
          ticks={[lo, (lo + 1) / 2, 1].map((v) => Math.round(v * 100) / 100)}
          fmt={(v) => `${Math.round(v * 100)}%`}
          refLines={[
            { v: ref, color: "var(--ink)", dash: "5 4", label: normal != null ? "Normal" : "Target" },
            { v: 0.85, color: "var(--ok)", dash: "2 4", label: "World-class 85%" },
          ]}
          dotColor={(v) => (v < ref - 0.08 ? "var(--bad)" : "var(--ok)")}
          aria="OEE by day"
        />
      )}
    </>
  );
}

function Signal({ s, rows }) {
  const b = s.baseline;
  let title, sub, value, fmt, normal, bad;
  if (s.formType === "machining_bits") {
    title = "Bits per 1,000 units";
    sub = `Tool wear signal from the bit-change answers. ${b?.ready && b.bitsPer1000 != null ? `Dashed line is normal (${n1(b.bitsPer1000)}).` : "No history yet for a normal line."}`;
    value = (r) => r.bitsPer1000;
    fmt = (v) => n1(v);
    normal = b?.ready ? b.bitsPer1000 : null;
    bad = (v) => normal != null && v > normal * 1.5;
  } else if (s.formType === "inspection") {
    title = s.name.toLowerCase().includes("plating") ? "Plating rejections" : "Measurement rejections";
    sub = `Share of inspected units rejected. ${b?.ready && b.rejRate != null ? `Dashed line is normal (${pct(b.rejRate)}).` : "No history yet for a normal line."}`;
    value = (r) => r.rejRate;
    fmt = (v) => pct(v, 1);
    normal = b?.ready ? b.rejRate : null;
    bad = (v) => v > Math.max((normal ?? 0.02) * 1.5, (normal ?? 0.02) + 0.01);
  } else {
    title = "Breakdown minutes per day";
    sub = "All machines at this step. Tall bars are the days to ask about.";
    value = (r) => (r.logged ? r.downMin : null);
    fmt = (v) => n0(v);
    normal = null;
    bad = (v) => v > 60;
  }
  const vals = rows.map(value).filter((v) => v != null);
  const max = Math.max(s.formType === "inspection" ? 0.05 : s.formType === "machining_bits" ? 3 : 60, normal ?? 0, ...vals) * 1.1;
  return (
    <>
      <h3 className="cond text-lg font-semibold">{title}</h3>
      <p className="text-sm muted mb-2">{sub}</p>
      {vals.length === 0 ? (
        <p className="muted py-3">Nothing logged yet.</p>
      ) : (
        <DayChart
          rows={rows}
          value={value}
          yMin={0}
          yMax={max}
          ticks={[0, max / 2, max]}
          fmt={fmt}
          bars
          refLines={normal != null ? [{ v: normal, color: "var(--ink)", dash: "5 4", label: "Normal" }] : []}
          dotColor={(v) => (bad(v) ? "var(--warn)" : "var(--steel)")}
          aria={title}
        />
      )}
    </>
  );
}

// ================================================================== KPI table
function KpiTable({ data, sel, onSelect }) {
  const cols = [
    ["OEE", (k) => pct(k.OEE), (b) => pct(b?.OEE)],
    ["Availability", (k) => pct(k.A), (b) => pct(b?.A)],
    ["Performance", (k) => pct(k.P), (b) => pct(b?.P)],
    ["Quality", (k) => pct(k.Q, 2), (b) => pct(b?.Q, 2)],
    ["Units / hr", (k) => n0(k.ratePerHr), (b) => n0(b?.ratePerHr)],
    ["Breakdown min", (k) => n0(k.downMin), null],
    ["MTBF h", (k) => (k.MTBF ? n1(k.MTBF) : "none"), (b) => (b?.MTBF ? n1(b.MTBF) : "—")],
    ["MTTR min", (k) => (k.MTTR ? n0(k.MTTR) : "none"), (b) => (b?.MTTR ? n0(b.MTTR) : "—")],
    ["Rejects", (k) => n0(k.rej), null],
    ["Bits / 1,000", (k) => (k.bitsPer1000 == null ? "—" : n1(k.bitsPer1000)), (b) => (b?.bitsPer1000 == null ? "—" : n1(b.bitsPer1000))],
  ];
  const order = stepOrder(data);
  const rows = [...data.machines].sort(
    (a, b) => order.indexOf(a.stepId) - order.indexOf(b.stepId) || a.name.localeCompare(b.name, undefined, { numeric: true })
  );
  return (
    <section className="panel p-5 mt-7" aria-labelledby="kpiTitle">
      <h2 id="kpiTitle" className="cond text-2xl font-semibold">All machines, all KPIs</h2>
      <p className="text-sm muted">
        Calculated from the shift logs. Small grey figures are each machine’s normal (median of its previous 20 days with logs). Steps without machines (QC, packing) show as one row.
      </p>
      {rows.length === 0 ? (
        <p className="muted py-4">No production logged in this period.</p>
      ) : (
        <div className="overflow-x-auto mt-2">
          <table className="kpi w-full min-w-[900px] text-[.9rem] border-collapse">
            <thead>
              <tr>
                <th>Machine</th>
                {cols.map((c) => (
                  <th key={c[0]}>
                    {c[0]}
                    {c[2] && <><br /><span className="font-normal">normal</span></>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const newStep = i === 0 || rows[i - 1].stepId !== m.stepId;
                const isSel = sel === m.stepId;
                return [
                  newStep && (
                    <tr key={`h${m.stepId}`}>
                      <td colSpan={cols.length + 1} className="!text-left pt-4 font-semibold" style={{ borderBottom: "1px solid var(--ink)" }}>
                        <button onClick={() => onSelect(m.stepId)} className="hover:underline">{m.stepName}</button>
                        {data.constraint?.stepId === m.stepId && <span className="pill warn ml-2">constraint</span>}
                        {m.std ? <span className="muted font-normal text-xs ml-2">standard {m.std}/hr</span> : <span className="text-xs ml-2" style={{ color: "var(--warn)" }}>no standard rate</span>}
                      </td>
                    </tr>
                  ),
                  <tr key={m.key} style={isSel ? { background: "var(--sunk)" } : undefined}>
                    <td>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: statusColor(m.status) }} />
                      {m.machineId ? m.name : <span className="muted">{m.name}</span>}
                    </td>
                    {cols.map((c) => (
                      <td key={c[0]} className="cond text-[1rem]">
                        {c[1](m.kpi)}
                        {c[2] && (
                          <>
                            <br />
                            <span className="muted text-[.8rem]">{m.baseline?.ready ? c[2](m.baseline) : "—"}</span>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ================================================================== ask the agent
const CHIPS = [
  "What should I fix first and why?",
  "Why is OEE below normal?",
  "Which step is the constraint and what does that mean?",
  "Will we deliver the open orders on time?",
  "Explain the OEE math for drilling",
];

function AskAgent({ data, range, family }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ctl = useRef(null);
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [log]);

  const ask = async (text) => {
    text = text.trim();
    if (!text || busy) return;
    setQ("");
    const history = log.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text }));
    const next = [...log, { role: "user", text }, { role: "assistant", text: "Looking at the data…", pending: true }];
    setLog(next);
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const res = await api.agent.ask(
        { messages: [...history, { role: "user", content: text }].slice(-8), from: range[0], to: range[1], ...(family ? { family } : {}) },
        ctl.current.signal
      );
      setLog([...next.slice(0, -1), { role: "assistant", text: res.answer, trace: res.toolsUsed }]);
    } catch (err) {
      const stopped = err.name === "AbortError";
      setLog([...next.slice(0, -1), { role: "assistant", text: stopped ? "Stopped." : err.message || "The answer was interrupted. Ask again.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-5 mt-7" aria-labelledby="askTitle">
      <h2 id="askTitle" className="cond text-2xl font-semibold">Ask the agent</h2>
      {!data.askEnabled ? (
        <p className="text-sm muted mt-1 max-w-[75ch]">
          Not switched on yet. Ask the agent uses Claude on the server and needs an Anthropic API key: add <code>ANTHROPIC_API_KEY</code> to the
          backend’s environment on Render and redeploy. Every answer is then built by calling the same KPI and diagnosis functions this page uses, so
          figures come from the logs, not from memory.
        </p>
      ) : (
        <>
          <p className="text-sm muted mt-1">Claude answers by calling the same KPI and diagnosis functions this page uses, for the period and products selected above.</p>
          <div className="flex flex-col gap-3 my-3 max-h-[520px] overflow-y-auto" aria-live="polite">
            {log.map((m, i) => (
              <div
                key={i}
                className="max-w-[78ch] px-3.5 py-2.5 rounded-md text-[.95rem] whitespace-pre-wrap"
                style={m.role === "user" ? { alignSelf: "flex-end", background: "var(--steel-soft)" } : { alignSelf: "flex-start", background: "var(--sunk)", color: m.error ? "var(--bad)" : undefined }}
              >
                {m.trace?.length ? <span className="block text-xs muted mb-1.5 whitespace-normal">Looked up: {m.trace.join(", ")}</span> : null}
                {m.pending ? <span className="muted">{m.text}</span> : m.text}
              </div>
            ))}
            <div ref={end} />
          </div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button key={c} className="rounded-full px-3 py-1 text-sm hover:border-solid" style={{ border: "1px dashed var(--line)" }} onClick={() => ask(c)} disabled={busy}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(q);
                }
              }}
              rows={2}
              placeholder="For example: why is CM1 slower than last week?"
              className="flex-1 resize-y min-h-[44px] max-h-40 rounded-md p-2.5"
              style={{ border: "1px solid var(--line)", background: "var(--surface)" }}
            />
            {busy ? (
              <button className="btn flex items-center gap-1.5" onClick={() => ctl.current?.abort()}>
                <Square className="w-4 h-4" /> Stop
              </button>
            ) : (
              <button className="btn primary flex items-center gap-1.5" onClick={() => ask(q)}>
                <Send className="w-4 h-4" /> Ask
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ================================================================== learning
function Learning({ data, onReset }) {
  const [busy, setBusy] = useState(false);
  const fmtMetric = (kind, v) => (v == null ? "—" : kind === "perf" || kind === "rej_rate" ? pct(v) : kind === "pace" ? n0(v) : n1(v));
  const better = (kind, before, after) => {
    if (before == null || after == null) return null;
    const lowerIsBetter = kind !== "perf" && kind !== "pace";
    return lowerIsBetter ? after < before : after > before;
  };
  return (
    <section className="panel p-5 mt-7" aria-labelledby="learnTitle">
      <h2 id="learnTitle" className="cond text-2xl font-semibold">What the agent has learned from your feedback</h2>
      <p className="text-sm muted max-w-[85ch]">
        When someone marks a recommendation as “Not the cause”, that diagnosis rule loses confidence (×0.8 each time, never below ×0.3) and ranks lower
        next time. “Mark done” records the figure at that moment, and the agent shows how it has moved since. This is shared by every manager.
      </p>
      <div className="overflow-x-auto mt-2">
        <table className="kpi w-full min-w-[560px] text-[.9rem] border-collapse">
          <thead>
            <tr><th>Diagnosis rule</th><th>Kind</th><th>Starting confidence</th><th>Weight from feedback</th><th>Not the cause</th><th>Marked done</th></tr>
          </thead>
          <tbody>
            {data.learning.map((r) => (
              <tr key={r.rule}>
                <td>{r.name}</td>
                <td className="muted">{r.kind}</td>
                <td className="cond">{Math.round(r.startConf * 100)}%</td>
                <td className="cond" style={{ color: r.factor < 1 ? "var(--warn)" : undefined }}>× {r.factor.toFixed(2)}</td>
                <td className="cond">{r.notCause}</td>
                <td className="cond">{r.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.actions.length > 0 && (
        <>
          <h3 className="cond text-lg font-semibold mt-5">Actions and results</h3>
          <div className="overflow-x-auto">
            <table className="kpi w-full min-w-[720px] text-[.9rem] border-collapse">
              <thead>
                <tr><th>Recommendation</th><th>Feedback</th><th>By</th><th>When</th><th>Tracked figure</th><th>At the time</th><th>Since</th></tr>
              </thead>
              <tbody>
                {data.actions.map((a) => {
                  const ok = better(a.metricKind, a.before, a.after);
                  return (
                    <tr key={a.id}>
                      <td className="!whitespace-normal max-w-[360px]">{a.title}</td>
                      <td>{a.action === "done" ? <span className="pill ok">Done</span> : <span className="pill none">Not the cause</span>}</td>
                      <td>{a.by || "—"}</td>
                      <td className="cond">{a.daysSince === 0 ? "today" : `${a.daysSince} d ago`}</td>
                      <td className="muted">{a.action === "done" ? a.metricLabel || "—" : ""}</td>
                      <td className="cond">{a.action === "done" ? fmtMetric(a.metricKind, a.before) : ""}</td>
                      <td className="cond" style={{ color: ok == null ? undefined : ok ? "var(--ok)" : "var(--bad)" }}>
                        {a.action === "done" ? (a.after == null ? (a.daysSince === 0 ? "from tomorrow" : "no logs yet") : fmtMetric(a.metricKind, a.after)) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-3">
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Reset all feedback? Rule weights go back to their starting confidence and the action history is cleared.")) return;
            setBusy(true);
            await onReset();
            setBusy(false);
          }}
        >
          Reset learning
        </button>
      </div>
    </section>
  );
}

// ================================================================== settings drawer
function SettingsDrawer({ data, onClose, onSaved }) {
  const [vpp, setVpp] = useState(data.settings.valuePerPiece ?? "");
  const [target, setTarget] = useState(Math.round((data.settings.targetOee ?? 0.65) * 100));
  const [procs, setProcs] = useState([]);
  const [rates, setRates] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.processes.list().then((ps) => {
      const prod = ps.filter((p) => p.formType !== "count");
      setProcs(prod);
      setRates(Object.fromEntries(prod.map((p) => [p.id, p.standardRatePerHour ?? ""])));
    });
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setErr(null);
      await api.agent.saveSettings({ valuePerPiece: vpp === "" ? null : Number(vpp), targetOee: Number(target) / 100 });
      for (const p of procs) {
        const raw = rates[p.id];
        const num = raw === "" || raw == null ? null : Number(raw);
        if (num !== (p.standardRatePerHour ?? null)) await api.processes.update(p.id, { name: p.name, standardRatePerHour: num });
      }
      onSaved();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="agent fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto p-5" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="flex justify-between items-center">
          <h2 className="cond text-2xl font-semibold">Settings</h2>
          <button onClick={onClose} aria-label="Close" className="p-1"><X className="w-5 h-5" /></button>
        </div>
        {err && <p className="text-sm mt-2" style={{ color: "var(--bad)" }}>{err}</p>}
        <label className="block mt-4">
          <span className="font-semibold text-sm">Value of one good unit (₹)</span>
          <span className="block text-xs muted">Optional. Turns recovered units into ₹ per day on each recommendation.</span>
          <input type="number" min="0" step="0.01" value={vpp} onChange={(e) => setVpp(e.target.value)} className="mt-1 w-40 px-2 py-1.5 rounded" style={{ border: "1px solid var(--line)" }} />
        </label>
        <label className="block mt-4">
          <span className="font-semibold text-sm">Target OEE (%)</span>
          <span className="block text-xs muted">Used for colours until there are 3+ days of history. Metal fabrication typically runs 55–65%; world-class is 85%.</span>
          <input type="number" min="10" max="100" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 w-24 px-2 py-1.5 rounded" style={{ border: "1px solid var(--line)" }} />
        </label>
        <h3 className="font-semibold text-sm mt-5">Standard rates (good units per hour, per machine, at full speed)</h3>
        <p className="text-xs muted">Drives Performance. A step without a rate shows no OEE.</p>
        <div className="mt-2 space-y-1.5">
          {procs.map((p) => (
            <label key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded" style={{ border: "1px solid var(--line)" }}>
              <span className="text-sm">{p.name}</span>
              <input
                type="number"
                min="0"
                value={rates[p.id] ?? ""}
                onChange={(e) => setRates((r) => ({ ...r, [p.id]: e.target.value }))}
                placeholder="—"
                className="w-24 px-2 py-1 rounded text-right cond"
                style={{ border: "1px solid var(--line)" }}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-5 sticky bottom-0 py-3" style={{ background: "var(--surface)" }}>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
