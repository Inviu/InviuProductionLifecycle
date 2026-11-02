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

  const totalUnits = useMemo(
    () => entries.reduce((sum, e) => sum + (e.unitsProduced || 0), 0),
    [entries]
  );

  const fmtTime = (iso) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Total Entries" value={entries.length} />
          <StatCard label="Units Logged" value={totalUnits} tone="blue" />
          <StatCard
            label="Latest"
            value={entries[0] ? new Date(entries[0].date).toLocaleDateString() : "-"}
          />
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
                    {["Date", "Product", "Process", "Machine", "Worker", "Shift", "Units", "Issues"].map((h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider"
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
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {new Date(e.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-medium">
                          {e.productName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {e.processName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {e.machineName || "-"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {e.workerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 text-sm">
                          {fmtTime(e.shiftStartTime)} – {fmtTime(e.shiftEndTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-semibold">
                          {e.unitsProduced}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {e.productionIssueReasons && e.productionIssueReasons.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {e.productionIssueReasons.map((r, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 border border-amber-200"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
};

const StatCard = ({ label, value, tone = "slate" }) => (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
  </div>
);
