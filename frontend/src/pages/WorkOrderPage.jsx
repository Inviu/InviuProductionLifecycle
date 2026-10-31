import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { ProcessCard } from "../components/ProcessCard";
import { api } from "../services/api";
import { ArrowLeft, Save, Loader } from "lucide-react";

export const WorkOrderPage = () => {
  const {
    currentOrderId,
    workOrders,
    navigateTo,
    updateWorkOrder,
    addWorkOrder,
    getWorkOrderById,
    loading,
  } = useApp();
  const isEditMode = !!currentOrderId;
  const existingOrder = isEditMode
    ? workOrders.find((o) => o.id === currentOrderId)
    : null;

  const [customerName, setCustomerName] = useState(
    existingOrder?.customerName || ""
  );
  const [selectedProductId, setSelectedProductId] = useState(
    existingOrder?.productId || ""
  );
  const [quantity, setQuantity] = useState(existingOrder?.quantity || 0);
  const [dueDate, setDueDate] = useState(existingOrder?.dueDate || "");
  const [products, setProducts] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [processAssignments, setProcessAssignments] = useState(
    existingOrder?.processAssignments || []
  );
  const [showForm2, setShowForm2] = useState(!!existingOrder);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingProcesses, setLoadingProcesses] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isEditMode && currentOrderId) {
      loadOrderById(currentOrderId);
    }
  }, [isEditMode, currentOrderId]);

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId && quantity > 0 && !isEditMode) {
      loadProcesses(selectedProductId);
    }
  }, [selectedProductId, quantity, isEditMode]);

  const loadOrderById = async (orderId) => {
    try {
      const order = await getWorkOrderById(orderId);

      setCustomerName(order.customerName);
      setSelectedProductId(order.productId);
      setQuantity(order.quantity);
      setDueDate(order.dueDate ? order.dueDate.split("T")[0] : "");

      const hydratedProcesses = order.processes.map((p) => ({
        processId: p.processId,
        processName: p.processName,
        availableQuantity: p.availableQuantity,
        completedQuantity: p.completedQuantity,
        status: p.status,
        assignments: p.machines.map((m) => ({
          machineId: m.machineId,
          machineName: m.machineName,
          quantity: m.assignedQuantity,
        })),
      }));
      console.log(hydratedProcesses, "hh");

      setProcessAssignments(hydratedProcesses);
      setShowForm2(true);
    } catch (err) {
      setError("Failed to load order details");
    }
  };

  const loadProducts = async () => {
    try {
      setLoadingProducts(true);
      const data = await api.products.getAll();
      setProducts(data);
    } catch (err) {
      setError("Failed to load products: " + err.message);
      console.error("Error loading products:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadProcesses = async (productId) => {
    try {
      setLoadingProcesses(true);
      const data = await api.processes.getByProductId(productId);
      setProcesses(data || []);

      const initialAssignments = (data || []).map((process, index) => ({
        processId: process.id,
        processName: process.name,
        availableQuantity: index === 0 ? quantity : 0,
        completedQuantity: 0,
        status: index === 0 ? "Ready" : "Locked",
        assignments: [],
      }));

      console.log(quantity, "ss");
      console.log(initialAssignments, "ss");

      setProcessAssignments(initialAssignments);
      setShowForm2(true);
    } catch (err) {
      setError("Failed to load processes: " + err.message);
      console.error("Error loading processes:", err);
    } finally {
      setLoadingProcesses(false);
    }
  };

  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
  };

  const handleProcessAssignment = (
    processId,
    newAssignments,
    inventoryUsed = 0
  ) => {
    setProcessAssignments((prev) => {
      const currentIdx = prev.findIndex((p) => p.processId === processId);
      const current = prev[currentIdx];
      const updated = [...prev];

      if (inventoryUsed > 0) {
        const newCompleted = current.completedQuantity + inventoryUsed;
        updated[currentIdx] = {
          ...current,
          completedQuantity: newCompleted,
          inventoryUsed: (current.inventoryUsed || 0) + inventoryUsed, // accumulate for save
          status:
            newCompleted >= current.availableQuantity
              ? "Completed"
              : current.status,
        };
      } else {
        // Append new assignments to existing
        updated[currentIdx] = {
          ...current,
          assignments: [...(current.assignments || []), ...newAssignments],
          status: "Assigned",
        };
      }

      // Update next process availableQuantity from current's completedQuantity
      if (currentIdx + 1 < updated.length) {
        updated[currentIdx + 1] = {
          ...updated[currentIdx + 1],
          availableQuantity: updated[currentIdx].completedQuantity,
        };
      }

      return updated;
    });
  };

  const handleSaveOrder = async () => {
    if (!customerName || !selectedProductId || quantity <= 0) {
      setError("Please fill all required fields");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const orderPayload = {
        id: isEditMode ? currentOrderId : undefined,
        customerName,
        productId: Number(selectedProductId),
        quantity: Number(quantity),
        dueDate: dueDate || null,
        processes: processAssignments.map((p, index) => ({
          processId: p.processId,
          sequence: index + 1,
          availableQuantity: p.availableQuantity,
          completedQuantity: p.completedQuantity,
          inventoryUsed: p.inventoryUsed || 0,
          status: p.status === "Locked" ? "Ready" : p.status,
          machines: p.assignments.map((a) => ({
            machineId: a.machineId,
            assignedQuantity: a.quantity,
          })),
        })),
      };

      if (isEditMode) {
        await updateWorkOrder(orderPayload);
      } else {
        await addWorkOrder(orderPayload);
      }

      navigateTo("home");
    } catch (err) {
      setError("Failed to save order: " + err.message);
      console.error("Error saving order:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // const isProcessLocked = (index) => {
  //   if (index === 0) return false;
  //   const previousProcess = processAssignments[index - 1];
  //   return previousProcess.completedQuantity === 0;
  // };
  const isProcessLocked = (index) => {
    if (index === 0) return false;

    const prev = processAssignments[index - 1];
    return prev.status !== "Completed" && prev.completedQuantity === 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigateTo("home")}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isEditMode
                  ? `Work Order WO-${String(currentOrderId).padStart(3, "0")}`
                  : "New Work Order"}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {isEditMode
                  ? "View and manage work order details"
                  : "Create a new work order"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            Work Order Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Customer Name <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter customer name"
                disabled={isEditMode}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Product Type <span className="text-red-600">*</span>
              </label>
              {loadingProducts ? (
                <div className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 flex items-center gap-2">
                  <Loader className="w-4 h-4 animate-spin text-blue-600" />
                  Loading products...
                </div>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  disabled={isEditMode}
                >
                  <option value="">Select Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Quantity <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={quantity || ""}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter quantity"
                disabled={isEditMode}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Due Date <span className="text-slate-500">(Optional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {showForm2 && processAssignments.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Process Assignment
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Assign machines to each process in sequence
                </p>
              </div>
            </div>

            {loadingProcesses ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {processAssignments.map((process, index) => (
                  <ProcessCard
                    key={process.processId}
                    process={process}
                    isLocked={isProcessLocked(index)}
                    onSave={(assignments) =>
                      handleProcessAssignment(process.processId, assignments)
                    }
                    orderId={isEditMode ? currentOrderId : null}
                    onAssignmentSave={handleProcessAssignment}
                    productId={selectedProductId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={() => navigateTo("home")}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveOrder}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {isSaving && <Loader className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {isEditMode ? "Update Order" : "Create Order"}
          </button>
        </div>
      </main>
    </div>
  );
};
