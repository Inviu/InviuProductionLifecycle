// Central API client for the INVIU mobile app.
//
// Talks to the shared FlowForge web backend (same database the web dashboard
// uses), so anything logged from the phone is visible on the web and vice
// versa. The base URL comes from app.json -> expo.extra.apiUrl so it can be
// changed per environment without touching code.

import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const RAW_BASE =
  Constants?.expoConfig?.extra?.apiUrl ||
  Constants?.manifest?.extra?.apiUrl ||
  "https://flowforge-backend-mip6.onrender.com";

export const BASE_URL = RAW_BASE.replace(/\/+$/, "");

const TOKEN_KEY = "inviu_token";

let authToken = null;
let onUnauthorized = null;

// Allow the auth layer to react to a 401 (e.g. force logout).
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getToken() {
  return authToken;
}

export async function loadToken() {
  try {
    authToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    authToken = null;
  }
  return authToken;
}

export async function setToken(token) {
  authToken = token;
  try {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Non-fatal: token still lives in memory for this session.
  }
}

export async function clearToken() {
  await setToken(null);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error("Network error — check your connection and try again.");
  }

  if (res.status === 401) {
    await clearToken();
    if (onUnauthorized) onUnauthorized();
    throw new Error("Session expired. Please log in again.");
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  auth: {
    login: (username, password) =>
      request("/api/auth/login", {
        method: "POST",
        body: { username, password },
        auth: false,
      }),
    me: () => request("/api/auth/me"),
  },
  products: {
    list: () => request("/api/products"),
  },
  processes: {
    forProduct: (productId) => request(`/api/products/${productId}/processes`),
  },
  machines: {
    forProcess: (processId) => request(`/api/machines?processId=${processId}`),
  },
  production: {
    create: (payload) =>
      request("/api/production-entries", { method: "POST", body: payload }),
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/production-entries${qs ? `?${qs}` : ""}`);
    },
  },
};

export default api;
