import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { ProcessCard } from "../components/ProcessCard";
import { api } from "../services/api";
import { ArrowLeft, Save, Loader } from "lucide-react";

export const WorkOrderPage = () => {
  const { currentOrderId, navigateTo, createWorkOrder, getWorkOrderById, role } = useApp();
  const isEditMode = !!currentOrderId;

  const [customerName, setCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [products, setProducts] = useState([]);
  const [order, setOrder] = useState(null); // server detail in edit mode
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const canManage = role === "manager";

  useEffect(() => {
    setLoadingProducts(true);
    api.products
      .getAll()
      .then(setProducts)
      .catch((e) => setError("Failed to load products: " + e.message))
      .finally(() => setLoadingProducts(false));
  }, []);

  useEffect(() => {
    if (isEditMode) loadOrder(currentOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, currentOrderId]);

  const loadOrder = async (orderId) => {
    try {
      setLoadingOrder(true);
      const detail = await getWorkOrderById(orderId);
      setOrder(detail);
      setCustomerName(detail.customerName);
      setSelectedProductId(detail.productId);
      setQuantity(detail.quantity);
      setDueDate(detail.dueDate ? detail.dueDate.split("T")[0] : "");
    } catch (err) {
      setError("Failed to load order: " + err.message);
    } finally {
      setLoadingOrder(false);
    }
  };

  const handleCreate = async () => {
    if (!customerName || !selectedProductId || quantity <= 0) {
      setError("Please fill all required fields");
      return;
    }
    try {
      setIsSaving(true);
      setError(null);
      const created = await createWorkOrder({
        customerName,
        productId: Number(selectedProductId),
        quantity: Number(quantity),
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      // Switch into edit mode for the new order so machines can be assigned.
      navigateTo("workorder", created.id);
    } catch (err) {
      setError("Failed to create order: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDueDate = async () => {
    try {
      setIsSaving(true);
      const updated = await api.workOrders.updateHeader(currentOrderId, {
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });
      setOrder(updated);
    } catch (err) {
      setError("Failed to update: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingOrder) {
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
                  ? `${order?.status || ""} — assign machines and record completions`
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
          <h2 className="text-xl font-bold text-slate-900 mb-6">Work Order Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Customer Name" required>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={isEditMode}
                className={inputCls}
                placeholder="Enter customer name"
              />
            </Field>

            <Field label="Product" required>
              {loadingProducts ? (
                <div className={`${inputCls} flex items-center gap-2`}>
                  <Loader className="w-4 h-4 animate-spin text-blue-600" /> Loading…
                </div>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={isEditMode}
                  className={inputCls}
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Quantity" required>
              <input
                type="number"
                min="1"
                value={quantity || ""}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                disabled={isEditMode}
                className={inputCls}
                placeholder="Enter quantity"
              />
            </Field>

            <Field label="Due Date (optional)">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputCls}
                />
                {isEditMode && canManage && (
                  <button
                    onClick={handleSaveDueDate}
                    disabled={isSaving}
                    className="px-3 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm"
                  >
                    Save
                  </button>
                )}
              </div>
            </Field>
          </div>
        </div>

        {isEditMode && order && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Process Chain</h2>
            <p className="text-sm text-slate-600 mb-6">
              Each process unlocks once the previous one completes a unit.
            </p>
            <div className="space-y-4">
              {order.processes.map((process) => (
                <ProcessCard
                  key={process.processId}
                  order={order}
                  process={process}
                  productId={order.productId}
                  canManage={canManage}
                  onChanged={setOrder}
                  onError={setError}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={() => navigateTo("home")}
            className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            {isEditMode ? "Back to Orders" : "Cancel"}
          </button>
          {!isEditMode && (
            <button
              onClick={handleCreate}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              {isSaving && <Loader className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              Create Order
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

const inputCls =
  "w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-100 disabled:text-slate-500";

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-2">
      {label} {required && <span className="text-red-600">*</span>}
    </label>
    {children}
  </div>
);
