import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  CheckCircle,
  Clock,
  Plus,
  X,
  Loader,
} from "lucide-react";
import { api } from "../services/api";

export const ProcessCard = ({ order, process, productId, canManage, onChanged, onError }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [rows, setRows] = useState([{ machineId: "", quantity: 0 }]);
  const [inventory, setInventory] = useState(0);
  const [inventoryUsed, setInventoryUsed] = useState(0);
  const [busy, setBusy] = useState(false);

  const isLocked = process.status === "Locked";
  const isCompleted = process.status === "Completed";
  const assignedTotal = (process.machines || []).reduce((s, m) => s + (m.assignedQuantity || 0), 0);
  const remaining = process.availableQuantity - process.completedQuantity;
  const unassigned = process.availableQuantity - assignedTotal;
  const progress =
    process.availableQuantity > 0
      ? (process.completedQuantity / process.availableQuantity) * 100
      : 0;
  const completionMax = Math.min(inventory, remaining);

  const handleExpand = async () => {
    if (isLocked) return;
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    if (availableMachines.length === 0) {
      setLoadingMachines(true);
      try {
        setAvailableMachines(await api.machines.getByProcessId(process.processId));
      } catch (e) {
        onError?.("Failed to load machines: " + e.message);
      } finally {
        setLoadingMachines(false);
      }
    }
    try {
      const inv = await api.inventory.get(productId, process.processId);
      setInventory(inv.availableQuantity || 0);
    } catch {
      /* inventory optional */
    }
    setIsExpanded(true);
  };

  const updateRow = (i, field, value) => {
    const next = [...rows];
    next[i] = { ...next[i], [field]: field === "machineId" ? value : parseInt(value) || 0 };
    setRows(next);
  };

  const assignedInRows = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const canAssign =
    rows.every((r) => r.machineId && r.quantity > 0) &&
    assignedInRows <= unassigned &&
    assignedInRows > 0;

  const handleAssign = async () => {
    if (!canAssign) return;
    try {
      setBusy(true);
      const machines = rows.map((r) => ({
        machineId: Number(r.machineId),
        assignedQuantity: Number(r.quantity),
      }));
      const updated = await api.workOrders.assign(order.id, process.processId, machines);
      onChanged(updated);
      setRows([{ machineId: "", quantity: 0 }]);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (inventoryUsed <= 0) return;
    try {
      setBusy(true);
      const updated = await api.workOrders.complete(order.id, process.processId, inventoryUsed);
      onChanged(updated);
      setInventoryUsed(0);
      const inv = await api.inventory.get(productId, process.processId);
      setInventory(inv.availableQuantity || 0);
    } catch (e) {
      onError?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const statusIcon = isLocked ? (
    <Lock className="w-5 h-5 text-slate-400" />
  ) : isCompleted ? (
    <CheckCircle className="w-5 h-5 text-green-600" />
  ) : process.status === "Assigned" ? (
    <Clock className="w-5 h-5 text-blue-600" />
  ) : (
    <Clock className="w-5 h-5 text-yellow-600" />
  );

  const cardColor = isLocked
    ? "bg-slate-100 border-slate-300"
    : isCompleted
    ? "bg-green-50 border-green-300"
    : process.status === "Assigned"
    ? "bg-blue-50 border-blue-300"
    : "bg-yellow-50 border-yellow-300";

  return (
    <div className={`border-2 rounded-lg overflow-hidden transition ${cardColor}`}>
      <div
        className={`p-4 ${!isLocked ? "cursor-pointer" : ""}`}
        onClick={() => !isLocked && handleExpand()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {statusIcon}
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">
                {process.sequence}. {process.processName}
              </h3>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                <span>Available: <b className="text-slate-900">{process.availableQuantity}</b></span>
                <span>Completed: <b className="text-slate-900">{process.completedQuantity}</b></span>
                <span className="font-medium">{isLocked ? "Locked" : process.status}</span>
              </div>
            </div>
          </div>
          {!isLocked &&
            (isExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ))}
        </div>

        {process.availableQuantity > 0 && (
          <div className="mt-3">
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${isCompleted ? "bg-green-600" : "bg-blue-600"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 mt-1">Progress: {progress.toFixed(0)}%</div>
          </div>
        )}
      </div>

      {isExpanded && !isLocked && (
        <div className="border-t border-slate-300 bg-white p-4 space-y-4">
          {(process.machines || []).length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Assigned Machines</h4>
              {process.machines.map((m, i) => (
                <div key={i} className="flex justify-between p-2 bg-slate-50 rounded-lg mb-1">
                  <span className="text-slate-900">{m.machineName}</span>
                  <span className="font-semibold text-slate-900">{m.assignedQuantity} units</span>
                </div>
              ))}
            </div>
          )}

          {/* Complete from inventory — anyone on the floor */}
          {remaining > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-slate-900 mb-1">Complete from Inventory</h4>
              <div className="text-xs text-slate-600 mb-2">
                Inventory available: {inventory} | Remaining: {remaining} | Max: {completionMax}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={completionMax}
                  value={inventoryUsed || ""}
                  onChange={(e) =>
                    setInventoryUsed(Math.min(Number(e.target.value) || 0, completionMax))
                  }
                  className="w-24 px-2 py-1 border rounded"
                />
                <button
                  onClick={handleComplete}
                  disabled={inventoryUsed <= 0 || busy}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm disabled:bg-gray-300 flex items-center gap-1"
                >
                  {busy && <Loader className="w-3 h-3 animate-spin" />} Complete
                </button>
              </div>
            </div>
          )}

          {/* Assign machines — managers only */}
          {canManage && !isCompleted && unassigned > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-slate-900">Assign Machines</h4>
                <button
                  onClick={() => setRows([...rows, { machineId: "", quantity: 0 }])}
                  className="flex items-center gap-1 text-blue-600 text-sm"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {loadingMachines ? (
                <div className="flex justify-center py-4">
                  <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-3">
                    {rows.map((r, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          value={r.machineId}
                          onChange={(e) => updateRow(i, "machineId", e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg outline-none"
                        >
                          <option value="">Select Machine</option>
                          {availableMachines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          value={r.quantity || ""}
                          onChange={(e) => updateRow(i, "quantity", e.target.value)}
                          placeholder="Qty"
                          className="w-28 px-3 py-2 border border-slate-300 rounded-lg outline-none"
                        />
                        {rows.length > 1 && (
                          <button
                            onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                            className="p-2 text-red-600"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-3 text-sm text-slate-700">
                    <span>
                      Unassigned: <b>{unassigned}</b> | Entering: {assignedInRows}
                    </span>
                    {assignedInRows > unassigned && (
                      <span className="text-red-600">Exceeds unassigned</span>
                    )}
                  </div>

                  <button
                    onClick={handleAssign}
                    disabled={!canAssign || busy}
                    className={`w-full py-2 rounded-lg font-medium flex items-center justify-center gap-2 ${
                      canAssign && !busy
                        ? "bg-blue-600 text-white"
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {busy && <Loader className="w-4 h-4 animate-spin" />} Save Assignment
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
