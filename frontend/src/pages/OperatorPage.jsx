import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { LogOut, RefreshCw, Loader, CheckCircle, PackageCheck } from "lucide-react";

export const OperatorPage = () => {
  const { user, logout } = useApp();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [inputs, setInputs] = useState({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setQueue(await api.operator.queue());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const complete = async (item) => {
    const qty = Number(inputs[item.orderProcessId]) || 0;
    if (qty <= 0) return;
    try {
      setBusyId(item.orderProcessId);
      setError(null);
      await api.workOrders.complete(item.orderId, item.processId, qty);
      setInputs((p) => ({ ...p, [item.orderProcessId]: "" }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Queue</h1>
            <p className="text-sm text-slate-600">{user?.displayName || user?.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              aria-label="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={logout}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : queue.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            Nothing to do right now.
          </div>
        ) : (
          <div className="space-y-4">
            {queue.map((item) => {
              const max = Math.min(item.remaining, item.inventoryAvailable);
              const val = inputs[item.orderProcessId] ?? "";
              return (
                <div
                  key={item.orderProcessId}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs font-semibold text-blue-600">
                        WO-{String(item.orderId).padStart(3, "0")} · {item.customerName}
                      </div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5">
                        {item.processName}
                      </div>
                      <div className="text-sm text-slate-600">{item.productName}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold text-slate-900">{item.remaining} left</div>
                      <div className="text-slate-500">stock {item.inventoryAvailable}</div>
                    </div>
                  </div>

                  {item.machines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.machines.map((m) => (
                        <span
                          key={m.machineId}
                          className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full"
                        >
                          {m.machineName}: {m.assignedQuantity}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max={max}
                      value={val}
                      onChange={(e) =>
                        setInputs((p) => ({
                          ...p,
                          [item.orderProcessId]: Math.min(Number(e.target.value) || 0, max) || "",
                        }))
                      }
                      placeholder={`0 – ${max}`}
                      className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => complete(item)}
                      disabled={!val || busyId === item.orderProcessId || max <= 0}
                      className="px-5 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold flex items-center gap-2 disabled:bg-slate-300"
                    >
                      {busyId === item.orderProcessId ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : (
                        <PackageCheck className="w-5 h-5" />
                      )}
                      Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
