const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API request failed");
  }
  return response.json();
};

export const api = {
  products: {
    getAll: async () => {
      const response = await fetch(`${API_BASE_URL}/api/getAllProducts`);
      return handleResponse(response);
    },
  },

  processes: {
    getByProductId: async (productId) => {
      const response = await fetch(
        `${API_BASE_URL}/api/getprocess/${productId}`
      );
      return handleResponse(response);
    },
  },

  machines: {
    getByProcessId: async (processId) => {
      const response = await fetch(
        `${API_BASE_URL}/api/getMachines/${processId}`
      );
      const data = await handleResponse(response);
      return data.machines || [];
    },
  },

  inventory: {
    get: async (productId, processId) => {
      const response = await fetch(
        `${API_BASE_URL}/api/inventory/product/${productId}/process/${processId}`
      );
      return handleResponse(response);
    },
  },

  workOrders: {
    getAll: async () => {
      const response = await fetch(`${API_BASE_URL}/api/work-orders`);
      return handleResponse(response);
    },

    getById: async (orderId) => {
      const response = await fetch(
        `${API_BASE_URL}/api/work-orders/${orderId}`
      );
      return handleResponse(response);
    },

    create: async (orderData) => {
      const response = await fetch(`${API_BASE_URL}/api/work-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      return handleResponse(response);
    },

    update: async (orderId, orderData) => {
      const response = await fetch(
        `${API_BASE_URL}/api/work-orders/${orderId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        }
      );
      return handleResponse(response);
    },
  },
};
