import { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { ArrowLeft, LogOut, RefreshCw, Loader, Smartphone } from "lucide-react";

export const ProductionLogPage = () => {
  const { navigateTo, logout } = useApp();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      setEntries(await api.production.list());
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

  const stats = useMemo(() => {
    const breakdowns = entries.filter((e) => (e.downtimeMinutes || 0) > 0);
    return {
      breakdowns: breakdowns.length,
      breakdownMinutes: breakdowns.reduce((s, e) => s + e.downtimeMinutes, 0),
      rejections: entries.reduce((s, e) => s + (e.rejectedUnits || 0), 0),
      bits: entries.reduce((s, e) => s + (e.bitsChanged || 0), 0),
    };
  }, [entries]);

  // Entry dates are stored as the calendar day the operator picked (UTC midnight).
  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-";

  const fmtTime = (iso) => {
    if (!iso) return "-";
    try {
      // Shift times are stored as the naive clock value the operator entered
      // (treated as UTC), so display them in UTC to echo exactly that value
      // rather than shifting them into the viewer's timezone.
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
    } catch {
      return "-";
    }
  };

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
                <Smartphone className="w-6 h-6 text-blue-600" />
                Production Log
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Shift entries logged by operators on the floor
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Entries" value={entries.length} />
          <StatCard
            label="Breakdowns"
            value={stats.breakdowns ? `${stats.breakdowns} · ${fmtMinutes(stats.breakdownMinutes)}` : 0}
            tone="red"
          />
          <StatCard label="Rejections" value={stats.rejections} tone="amber" />
          <StatCard label="Bits Changed" value={stats.bits} tone="blue" />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Date", "Product", "Step", "Machine", "Worker", "Shift", "Output", "Breakdown / Notes"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                        No production entries yet. Entries logged from the mobile app appear here.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {fmtDate(e.date)}
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-medium min-w-[160px]">
                          {e.productName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {e.processName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {e.machineName || "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                          {e.workerName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-sm">
                          {e.shiftStartTime || e.shiftEndTime
                            ? `${fmtTime(e.shiftStartTime)} – ${fmtTime(e.shiftEndTime)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Output e={e} />
                        </td>
                        <td className="px-4 py-3 text-slate-700 min-w-[220px]">
                          <Notes e={e} fmtTime={fmtTime} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-slate-600">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </div>
      </main>
    </div>
  );
};

const toneMap = {
  slate: "text-slate-900",
  blue: "text-blue-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

// What the step produced, in the terms its form uses.
const Output = ({ e }) => {
  if (e.unitsInspected != null) {
    return (
      <div className="text-sm">
        <div className="font-semibold text-slate-900">{e.unitsProduced} good</div>
        <div className="text-slate-500">
          {e.unitsInspected} inspected · <span className="text-amber-700">{e.rejectedUnits} rejected</span>
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm">
      <span className="font-semibold text-slate-900">{e.unitsProduced}</span>
      {e.boxes != null && <span className="text-slate-500"> · {e.boxes} boxes</span>}
    </div>
  );
};

const Chip = ({ tone, children }) => (
  <span
    className={`px-2 py-0.5 text-xs rounded-full border ${
      tone === "red"
        ? "bg-red-50 text-red-700 border-red-200"
        : tone === "blue"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-100 text-amber-800 border-amber-200"
    }`}
  >
    {children}
  </span>
);

const Notes = ({ e, fmtTime }) => {
  const chips = [];
  if ((e.downtimeMinutes || 0) > 0) {
    const window = e.breakdownStart ? `${fmtTime(e.breakdownStart)}–${fmtTime(e.breakdownEnd)}, ` : "";
    chips.push(
      <Chip key="bd" tone="red">
        Breakdown {window}
        {fmtMinutes(e.downtimeMinutes)}
        {e.downtimeReason ? ` — ${e.downtimeReason}` : ""}
      </Chip>
    );
  }
  if ((e.bitsChanged || 0) > 0) {
    chips.push(
      <Chip key="bits" tone="blue">
        {e.bitsChanged} {e.bitsChanged === 1 ? "bit" : "bits"} changed
      </Chip>
    );
  }
  (e.productionIssueReasons || []).forEach((r, i) => chips.push(<Chip key={`r${i}`}>{r}</Chip>));
  return chips.length ? <div className="flex flex-wrap gap-1">{chips}</div> : <span className="text-slate-400">—</span>;
};

const StatCard = ({ label, value, tone = "slate" }) => (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
  </div>
);
