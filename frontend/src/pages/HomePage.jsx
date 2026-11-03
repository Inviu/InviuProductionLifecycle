import { useState, useMemo, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { Plus, LogOut, Filter, X, Loader, Smartphone, Gauge } from "lucide-react";

export const HomePage = () => {
  const { user, workOrders, navigateTo, logout, loading, error, loadWorkOrders } =
    useApp();
  const [filters, setFilters] = useState({
    dateRange: undefined,
    customer: "",
    productType: "",
    status: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    loadWorkOrders();
    api.reports.summary().then(setSummary).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((order) => {
      if (
        filters.customer &&
        !order.customerName
          .toLowerCase()
          .includes(filters.customer.toLowerCase())
      ) {
        return false;
      }
      if (
        filters.productType &&
        !order.productType
          .toLowerCase()
          .includes(filters.productType.toLowerCase())
      ) {
        return false;
      }
      if (filters.status && order.status !== filters.status) {
        return false;
      }
      if (
        filters.dateRange?.start &&
        order.createdDate < filters.dateRange.start
      ) {
        return false;
      }
      if (filters.dateRange?.end && order.createdDate > filters.dateRange.end) {
        return false;
      }
      return true;
    });
  }, [workOrders, filters]);

  const getStatusColor = (status) => {
    switch (status) {
      case "Pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "In Progress":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Completed":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const clearFilters = () => {
    setFilters({
      dateRange: undefined,
      customer: "",
      productType: "",
      status: "",
    });
  };

  const hasActiveFilters =
    filters.customer ||
    filters.productType ||
    filters.status ||
    filters.dateRange;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Work Orders</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage and track all work orders
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
                showFilters
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  !
                </span>
              )}
            </button>
            <button
              onClick={() => navigateTo("production")}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
            >
              <Smartphone className="w-4 h-4" />
              Production Log
            </button>
            <button
              onClick={() => navigateTo("efficiency")}
              className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg transition"
            >
              <Gauge className="w-4 h-4" />
              Efficiency
            </button>
            <button
              onClick={() => navigateTo("workorder")}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              New Work Order
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

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard label="Total Orders" value={summary.totalOrders} tone="slate" />
            <SummaryCard label="In Progress" value={summary.ordersByStatus["In Progress"]} tone="blue" />
            <SummaryCard label="Completed" value={summary.ordersByStatus["Completed"]} tone="green" />
            <SummaryCard
              label="Units Done"
              value={`${summary.units.completed}/${summary.units.planned}`}
              tone="slate"
            />
          </div>
        )}

        {showFilters && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  Clear All
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={filters.customer}
                  onChange={(e) =>
                    setFilters({ ...filters, customer: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Search customer..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Product Type
                </label>
                <input
                  type="text"
                  value={filters.productType}
                  onChange={(e) =>
                    setFilters({ ...filters, productType: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Search product..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Date Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.dateRange?.start || ""}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        dateRange: {
                          ...filters.dateRange,
                          start: e.target.value,
                          end: filters.dateRange?.end || "",
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

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
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Product Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Created Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                      Due Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredWorkOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-slate-500"
                      >
                        No work orders found
                      </td>
                    </tr>
                  ) : (
                    filteredWorkOrders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => navigateTo("workorder", order.id)}
                        className="hover:bg-slate-50 cursor-pointer transition"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-blue-600">
                            WO-{String(order.id).padStart(3, "0")}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900">
                          {order.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {order.productType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-medium">
                          {order.quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusColor(
                              order.status
                            )}`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {new Date(order.createdDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                          {order.dueDate
                            ? new Date(order.dueDate).toLocaleDateString()
                            : "-"}
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
          Showing {filteredWorkOrders.length} of {workOrders.length} work orders
        </div>
      </main>
    </div>
  );
};

const toneMap = {
  slate: "text-slate-900",
  blue: "text-blue-600",
  green: "text-green-600",
};

const SummaryCard = ({ label, value, tone = "slate" }) => (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    <div className={`text-2xl font-bold mt-1 ${toneMap[tone]}`}>{value}</div>
  </div>
);
