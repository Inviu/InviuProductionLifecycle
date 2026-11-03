import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { ArrowLeft, LogOut, RefreshCw, Loader, Gauge, AlertTriangle } from "lucide-react";

export const EfficiencyPage = () => {
  const { navigateTo, logout } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await api.reports.efficiency());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateTo("home")}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 px-2 py-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Gauge className="w-6 h-6 text-blue-600" />
                Shift Efficiency
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Built from what operators log — throughput, losses, and trends
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : !data || data.totals.entries === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500">
            No production logged yet. This fills in as operators submit shift entries from the app.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Stat label="Units Produced" value={data.totals.units.toLocaleString()} tone="slate" />
              <Stat label="Shift Entries" value={data.totals.entries} tone="slate" />
              <Stat
                label="Avg Rate / hr"
                value={data.totals.avgRatePerHour ?? "—"}
                tone="blue"
              />
              <Stat label="Issues Logged" value={data.totals.issuesLogged} tone="amber" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Panel title="Output by machine" subtitle="units (rate / hr)">
                <BarList
                  rows={data.byMachine.map((m) => ({
                    label: m.machineName,
                    value: m.units,
                    note: m.ratePerHour != null ? `${m.ratePerHour}/hr` : "—",
                  }))}
                  color="#2563EB"
                />
              </Panel>

              <Panel title="Losses by cause" subtitle="times reported" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}>
                {data.lossByCause.length === 0 ? (
                  <Empty>No issues reported 🎉</Empty>
                ) : (
                  <BarList
                    rows={data.lossByCause.map((l) => ({ label: l.reason, value: l.count }))}
                    color="#D97706"
                  />
                )}
              </Panel>

              <Panel title="Output by product" subtitle="units">
                <BarList
                  rows={data.byProduct.slice(0, 8).map((p) => ({ label: p.productName, value: p.units }))}
                  color="#0891B2"
                />
              </Panel>

              <Panel title="Output by step" subtitle="units (rate / hr)">
                <BarList
                  rows={data.byProcess.map((p) => ({
                    label: p.processName,
                    value: p.units,
                    note: p.ratePerHour != null ? `${p.ratePerHour}/hr` : "—",
                  }))}
                  color="#4F46E5"
                />
              </Panel>

              <Panel title="Daily output" subtitle="units per day">
                <DailyBars rows={data.daily} />
              </Panel>

              <Panel title="Output by worker" subtitle="units">
                <BarList
                  rows={data.byWorker.map((w) => ({ label: w.workerName, value: w.units }))}
                  color="#059669"
                />
              </Panel>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const toneMap = {
  slate: "text-slate-900",
  blue: "text-blue-600",
  amber: "text-amber-600",
};
const Stat = ({ label, value, tone = "slate" }) => (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
  </div>
);

const Panel = ({ title, subtitle, icon, children }) => (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
    </div>
    {children}
  </div>
);

const Empty = ({ children }) => <div className="text-sm text-slate-400 py-4">{children}</div>;

const BarList = ({ rows, color }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-slate-700 truncate pr-2">{r.label}</span>
            <span className="text-slate-900 font-semibold tabular-nums whitespace-nowrap">
              {r.value.toLocaleString()}
              {r.note ? <span className="text-slate-400 font-normal"> · {r.note}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

const DailyBars = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <div className="flex items-end gap-2 h-36 pt-2">
      {rows.map((r) => (
        <div key={r.day} className="flex-1 flex flex-col items-center justify-end gap-1">
          <span className="text-[10px] text-slate-500 tabular-nums">{r.units}</span>
          <div
            className="w-full rounded-t bg-blue-500"
            style={{ height: `${(r.units / max) * 100}%`, minHeight: 2 }}
          />
          <span className="text-[10px] text-slate-400">{r.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
};
