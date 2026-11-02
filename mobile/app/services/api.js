// Central API client for the INVIU mobile app.
//
// Talks to the shared FlowForge web backend (same database the web dashboard
// uses). The base URL comes from app.json -> expo.extra.apiUrl.
//
// Offline behaviour:
//   - GET calls that pass a cacheKey store their last-good response and fall
//     back to it when the device is offline, so operators can keep navigating.
//   - Thrown errors carry metadata (`isNetworkError`, `status`) so callers and
//     the offline queue can tell a dropped connection from a server rejection.

import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getJSON, setJSON } from "./storage";

const RAW_BASE =
  Constants?.expoConfig?.extra?.apiUrl ||
  Constants?.manifest?.extra?.apiUrl ||
  "https://flowforge-backend-mip6.onrender.com";

export const BASE_URL = RAW_BASE.replace(/\/+$/, "");

const TOKEN_KEY = "inviu_token";
const CACHE_PREFIX = "inviu_cache:";

let authToken = null;
let onUnauthorized = null;

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
    /* token still held in memory for this session */
  }
}

export async function clearToken() {
  await setToken(null);
}

function networkError() {
  const e = new Error("You appear to be offline.");
  e.isNetworkError = true;
  return e;
}

async function request(path, { method = "GET", body, auth = true, cacheKey = null } = {}) {
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
  } catch {
    // Offline: serve last-good cache for cacheable reads, else signal offline.
    if (cacheKey) {
      const cached = await getJSON(CACHE_PREFIX + cacheKey, null);
      if (cached !== null) return cached;
    }
    throw networkError();
  }

  if (res.status === 401) {
    await clearToken();
    if (onUnauthorized) onUnauthorized();
    const e = new Error("Session expired. Please log in again.");
    e.status = 401;
    throw e;
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const e = new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
    e.status = res.status;
    throw e;
  }

  if (cacheKey) await setJSON(CACHE_PREFIX + cacheKey, data);
  return data;
}

export const api = {
  auth: {
    login: (username, password) =>
      request("/api/auth/login", { method: "POST", body: { username, password }, auth: false }),
    me: () => request("/api/auth/me"),
  },
  products: {
    list: () => request("/api/products", { cacheKey: "products" }),
  },
  processes: {
    forProduct: (productId) =>
      request(`/api/products/${productId}/processes`, { cacheKey: `processes:${productId}` }),
  },
  machines: {
    forProcess: (processId) =>
      request(`/api/machines?processId=${processId}`, { cacheKey: `machines:${processId}` }),
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
