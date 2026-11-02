// Offline queue for work-order step completions.
//
// Completions touch shared inventory + step-locking, so they can't be a silent
// offline guarantee. The queue holds completions made while offline and retries
// them on reconnect; any that the server can't apply (e.g. stock ran out, step
// re-locked) move to a "failed" list that is surfaced to the operator to redo —
// never silently dropped. A tiny pub/sub drives the live UI counts.

import { getJSON, setJSON } from "./storage";
import { api } from "./api";

const PENDING_KEY = "inviu_pending_completions";
const FAILED_KEY = "inviu_failed_completions";

const listeners = new Set();
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function getPending() {
  return getJSON(PENDING_KEY, []);
}
export async function getFailed() {
  return getJSON(FAILED_KEY, []);
}

function makeItem(payload) {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    queuedAt: new Date().toISOString(),
  };
}

async function addPending(payload) {
  const q = await getPending();
  q.push(makeItem(payload));
  await setJSON(PENDING_KEY, q);
  notify();
}

/**
 * Submit a completion. Tries online first; if offline it's queued and retried
 * later. A definite server rejection (4xx) is thrown so the screen can show it
 * immediately. Returns { status: 'applied' | 'queued', detail? }.
 */
export async function submitCompletion(payload) {
  try {
    const detail = await api.workOrders.complete(
      payload.orderId,
      payload.processId,
      payload.quantity,
      { machineId: payload.machineId, productionIssueReason: payload.productionIssueReason }
    );
    return { status: "applied", detail };
  } catch (err) {
    if (err && (err.isNetworkError || err.status === 401)) {
      await addPending(payload);
      return { status: "queued" };
    }
    throw err; // 4xx / server rejection — surface to the caller now
  }
}

// Retry the whole pending queue. Applied items are removed; still-offline items
// stay; server-rejected items move to the failed list with their reason.
export async function flushQueue() {
  const queue = await getPending();
  if (!queue.length) return { synced: 0, failed: 0, remaining: 0 };

  const stillPending = [];
  const newlyFailed = [];
  let synced = 0;

  for (const item of queue) {
    try {
      const p = item.payload;
      await api.workOrders.complete(p.orderId, p.processId, p.quantity, {
        machineId: p.machineId,
        productionIssueReason: p.productionIssueReason,
      });
      synced += 1;
    } catch (err) {
      if (err && (err.isNetworkError || err.status === 401)) {
        stillPending.push(item);
      } else {
        newlyFailed.push({ ...item, error: (err && err.message) || "Could not be applied" });
      }
    }
  }

  await setJSON(PENDING_KEY, stillPending);
  if (newlyFailed.length) {
    const failed = await getFailed();
    await setJSON(FAILED_KEY, [...failed, ...newlyFailed]);
  }
  notify();
  return { synced, failed: newlyFailed.length, remaining: stillPending.length };
}

export async function retryFailed() {
  const failed = await getFailed();
  if (!failed.length) return;
  const pending = await getPending();
  await setJSON(
    PENDING_KEY,
    [...pending, ...failed.map(({ error, ...rest }) => rest)]
  );
  await setJSON(FAILED_KEY, []);
  notify();
  return flushQueue();
}

export async function dismissFailed(localId) {
  const failed = await getFailed();
  await setJSON(FAILED_KEY, failed.filter((f) => f.localId !== localId));
  notify();
}
