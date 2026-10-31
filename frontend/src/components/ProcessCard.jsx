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

export const ProcessCard = ({
  process,
  isLocked,
  onSave,
  orderId,
  onAssignmentSave,
  productId,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const [machineAssignments, setMachineAssignments] = useState([
    { machineId: "", machineName: "", quantity: 0 },
  ]);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);

  const [inventoryAvailable, setInventoryAvailable] = useState(0);
  const [inventoryUsed, setInventoryUsed] = useState(0);

  const assignedTotal =
    process.assignments?.reduce((sum, a) => sum + (a.quantity || 0), 0) || 0;
  const displayAvailable =
    process.availableQuantity - process.completedQuantity;
  const displayAssigned = assignedTotal - process.completedQuantity;
  const unassigned = process.availableQuantity - assignedTotal;
  const showInvSection =
    orderId && displayAssigned > 0 && inventoryAvailable > 0;
  const showAssignSection = unassigned > 0;
  const completionMax = Math.min(inventoryAvailable, displayAssigned);

  const availableTotal = process.availableQuantity;

  const handleExpandClick = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    // fetch machines (existing logic)
    if (availableMachines.length === 0 && !loadingMachines) {
      setLoadingMachines(true);
      try {
        const machines = await api.machines.getByProcessId(process.processId);
        console.log(machines, "machines");
        console.log(process, "machines");
        setAvailableMachines(machines);
      } catch (error) {
        console.error("Error loading machines:", error);
      } finally {
        setLoadingMachines(false);
      }
    }

    // Fetch inventory ONLY while updating an existing order
    if (orderId) {
      try {
        const data = await api.inventory.get(productId, process.processId);
        setInventoryAvailable(data.availableQuantity || 0);
      } catch (e) {
        console.error("Failed to fetch inventory", e);
      }
    }

    setIsExpanded(true);
  };

  const getStatusIcon = () => {
    if (isLocked) return <Lock className="w-5 h-5 text-slate-400" />;
    if (process.status === "Completed")
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (process.status === "Assigned")
      return <Clock className="w-5 h-5 text-blue-600" />;
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  const getStatusColor = () => {
    if (isLocked) return "bg-slate-100 border-slate-300";
    if (process.status === "Completed") return "bg-green-50 border-green-300";
    if (process.status === "Assigned") return "bg-blue-50 border-blue-300";
    return "bg-yellow-50 border-yellow-300";
  };

  const addMachineRow = () => {
    setMachineAssignments([
      ...machineAssignments,
      { machineId: "", machineName: "", quantity: 0 },
    ]);
  };

  const removeMachineRow = (index) => {
    setMachineAssignments(machineAssignments.filter((_, i) => i !== index));
  };

  const updateMachineAssignment = (index, field, value) => {
    const updated = [...machineAssignments];
    if (field === "machineId") {
      const machine = availableMachines.find((m) => m.id === parseInt(value));
      if (machine) {
        updated[index] = {
          ...updated[index],
          machineId: parseInt(value),
          machineName: machine.name,
        };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setMachineAssignments(updated);
  };

  const totalAssigned = machineAssignments.reduce(
    (sum, m) => sum + (Number(m.quantity) || 0),
    0
  );

  const canSave =
    totalAssigned === unassigned &&
    machineAssignments.every((m) => m.machineId && m.quantity > 0);

  const handleSave = () => {
    if (!canSave) return;
    onAssignmentSave(process.processId, machineAssignments, 0);
    setMachineAssignments([{ machineId: "", machineName: "", quantity: 0 }]);
  };

  const progressPercentage =
    process.availableQuantity > 0
      ? (process.completedQuantity / process.availableQuantity) * 100
      : 0;

  return (
    <div
      className={`border-2 rounded-lg overflow-hidden transition ${getStatusColor()}`}
    >
      <div
        className={`p-4 ${!isLocked ? "cursor-pointer" : ""}`}
        onClick={() => !isLocked && handleExpandClick()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {getStatusIcon()}
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">
                {process.processName}
              </h3>
              <div className="flex items-center gap-4 mt-1 text-sm text-slate-600">
                <span>
                  Available:{" "}
                  <span className="font-medium text-slate-900">
                    {displayAvailable}
                  </span>
                </span>
                <span>
                  Assigned:{" "}
                  <span className="font-medium text-slate-900">
                    {displayAssigned}
                  </span>
                </span>
                <span>
                  Completed:{" "}
                  <span className="font-medium text-slate-900">
                    {process.completedQuantity}
                  </span>
                </span>
                <span
                  className={`font-medium ${
                    isLocked
                      ? "text-slate-500"
                      : process.status === "Completed"
                      ? "text-green-600"
                      : process.status === "Assigned"
                      ? "text-blue-600"
                      : "text-yellow-600"
                  }`}
                >
                  {isLocked ? "Locked" : process.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {process.status === "Assigned" &&
              process.assignments?.length > 0 && (
                <div className="text-sm text-slate-600 text-right">
                  <div className="font-medium text-slate-900">
                    {process.assignments.length} machine
                    {process.assignments.length > 1 ? "s" : ""} assigned
                  </div>
                </div>
              )}

            {!isLocked &&
              (isExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ))}
          </div>
        </div>

        {process.availableQuantity > 0 && (
          <div className="mt-3">
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  process.status === "Completed"
                    ? "bg-green-600"
                    : "bg-blue-600"
                }`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Progress: {progressPercentage.toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      {isExpanded && !isLocked && (
        <div className="border-t border-slate-300 bg-white p-4 space-y-4">
          {/* Always show existing assigned machines */}
          {process.assignments?.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">
                Assigned Machines
              </h4>
              {process.assignments.map((a, i) => (
                <div
                  key={i}
                  className="flex justify-between p-2 bg-slate-50 rounded-lg mb-1"
                >
                  <span className="text-slate-900">{a.machineName}</span>
                  <span className="font-semibold text-slate-900">
                    {a.quantity} units
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Inventory completion — only in update mode, only if assigned > completed and inv > 0 */}
          {showInvSection && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-slate-900 mb-1">
                Complete from Inventory
              </h4>
              <div className="text-xs text-slate-600 mb-2">
                Inventory available: {inventoryAvailable} | Max completable:{" "}
                {completionMax}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={completionMax}
                  value={inventoryUsed}
                  onChange={(e) =>
                    setInventoryUsed(
                      Math.min(Number(e.target.value) || 0, completionMax)
                    )
                  }
                  className="w-24 px-2 py-1 border rounded"
                />
                <button
                  onClick={() => {
                    if (inventoryUsed > 0) {
                      onAssignmentSave(process.processId, [], inventoryUsed);
                      setInventoryUsed(0);
                    }
                  }}
                  disabled={inventoryUsed === 0}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm disabled:bg-gray-300"
                >
                  Complete
                </button>
              </div>
            </div>
          )}

          {/* New machine assignment — only if unassigned > 0 */}
          {showAssignSection && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-slate-900">
                  Assign Machines
                </h4>
                <button
                  onClick={addMachineRow}
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
                    {machineAssignments.map((a, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          value={a.machineId || ""}
                          onChange={(e) =>
                            updateMachineAssignment(
                              i,
                              "machineId",
                              e.target.value
                            )
                          }
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
                          value={a.quantity || ""}
                          onChange={(e) =>
                            updateMachineAssignment(
                              i,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                          placeholder="Qty"
                          className="w-28 px-3 py-2 border border-slate-300 rounded-lg outline-none"
                        />
                        {machineAssignments.length > 1 && (
                          <button
                            onClick={() => removeMachineRow(i)}
                            className="p-2 text-red-600"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-3">
                    <span className="text-sm text-slate-700">
                      Must assign exactly{" "}
                      <span className="font-semibold">{unassigned}</span> units
                      | Currently: {totalAssigned}
                    </span>
                    {totalAssigned !== unassigned && (
                      <span className="text-sm text-red-600">Mismatch</span>
                    )}
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={!canSave}
                    className={`w-full py-2 rounded-lg font-medium ${
                      canSave
                        ? "bg-blue-600 text-white"
                        : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    Save Assignment
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
