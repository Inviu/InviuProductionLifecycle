const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

const TOKEN_KEY = "flowforge_token";

let authToken = null;
try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch {
  /* localStorage may be unavailable */
}

export const setToken = (token) => {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

export const getToken = () => authToken;

// Called when the server rejects our token; wired up by AppContext to log out.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

const request = async (path, { method = "GET", body } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    onUnauthorized();
  }

  if (!response.ok) {
    let message = "API request failed";
    try {
      const err = await response.json();
      message = err.error || message;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
};

export const api = {
  auth: {
    login: (username, password) =>
      request("/api/auth/login", { method: "POST", body: { username, password } }),
    me: () => request("/api/auth/me"),
  },

  products: {
    getAll: () => request("/api/products"),
    getProcesses: (productId) => request(`/api/products/${productId}/processes`),
  },

  machines: {
    getByProcessId: (processId) => request(`/api/machines?processId=${processId}`),
  },

  inventory: {
    get: (productId, processId) =>
      request(`/api/inventory/product/${productId}/process/${processId}`),
  },

  workOrders: {
    getAll: () => request("/api/work-orders"),
    getById: (orderId) => request(`/api/work-orders/${orderId}`),
    create: (orderData) => request("/api/work-orders", { method: "POST", body: orderData }),
    updateHeader: (orderId, data) =>
      request(`/api/work-orders/${orderId}`, { method: "PUT", body: data }),
    assign: (orderId, processId, machines) =>
      request(`/api/work-orders/${orderId}/processes/${processId}/assign`, {
        method: "POST",
        body: { machines },
      }),
    complete: (orderId, processId, quantity) =>
      request(`/api/work-orders/${orderId}/processes/${processId}/complete`, {
        method: "POST",
        body: { quantity },
      }),
  },

  operator: {
    queue: () => request("/api/operator/queue"),
  },
};
