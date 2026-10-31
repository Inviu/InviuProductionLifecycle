// Offline-resilient action queue for shop-floor completions.
//
// When the operator records a completion while offline (or a request fails on a
// flaky connection), the action is persisted to localStorage and retried
// automatically when connectivity returns. Each action is applied against the
// server, which remains the source of truth — so if an action can no longer be
// applied (e.g. inventory was consumed elsewhere), it surfaces as a failed item
// the operator can review, rather than silently corrupting state.

import { api } from "./api";

const STORAGE_KEY = "flowforge_offline_queue";

let state = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: [], // [{ id, orderId, processId, quantity, label, ts }]
  failed: [], // [{ action, error }]
  flushing: false,
};

const listeners = new Set();
const emit = () => listeners.forEach((l) => l(getState()));

export const getState = () => ({
  online: state.online,
  pending: [...state.pending],
  failed: [...state.failed],
  flushing: state.flushing,
});

export const subscribe = (fn) => {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
};

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pending: state.pending, failed: state.failed })
    );
  } catch {
    /* ignore */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { pending = [], failed = [] } = JSON.parse(raw);
      state.pending = pending;
      state.failed = failed;
    }
  } catch {
    /* ignore */
  }
}

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Submit a completion. If online, it is applied immediately. If offline or the
 * request fails for a network reason, it is queued for later sync.
 * @returns {Promise<{status:'applied'|'queued', detail?}>}
 */
export async function submitCompletion({ orderId, processId, quantity, label }) {
  const action = { id: genId(), orderId, processId, quantity, label, ts: Date.now() };

  if (!state.online) {
    enqueue(action);
    return { status: "queued" };
  }

  try {
    const detail = await api.workOrders.complete(orderId, processId, quantity);
    return { status: "applied", detail };
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue(action);
      return { status: "queued" };
    }
    // A real server rejection (validation/business rule) — do not queue; bubble up.
    throw err;
  }
}

function enqueue(action) {
  state.pending.push(action);
  persist();
  emit();
}

export function dismissFailed(actionId) {
  state.failed = state.failed.filter((f) => f.action.id !== actionId);
  persist();
  emit();
}

export async function retryFailed() {
  state.pending.push(...state.failed.map((f) => f.action));
  state.failed = [];
  persist();
  emit();
  return flush();
}

/** Attempt to apply all pending actions in order. Failures move to `failed`. */
export async function flush() {
  if (state.flushing || !state.online || state.pending.length === 0) return;
  state.flushing = true;
  emit();

  while (state.pending.length > 0 && state.online) {
    const action = state.pending[0];
    try {
      await api.workOrders.complete(action.orderId, action.processId, action.quantity);
      state.pending.shift();
    } catch (err) {
      if (isNetworkError(err)) break; // stop; will retry when back online
      // Server rejected this action — move it out of the way so the rest flush.
      state.pending.shift();
      state.failed.push({ action, error: err.message });
    }
    persist();
    emit();
  }

  state.flushing = false;
  persist();
  emit();
}

function isNetworkError(err) {
  // fetch throws TypeError on network failure; our API wrapper rethrows Errors
  // with server messages otherwise.
  return err instanceof TypeError || /network|failed to fetch|load failed/i.test(err.message || "");
}

export function initOfflineQueue() {
  if (typeof window === "undefined") return;
  restore();
  window.addEventListener("online", () => {
    state.online = true;
    emit();
    flush();
  });
  window.addEventListener("offline", () => {
    state.online = false;
    emit();
  });
  if (state.online) flush();
}
