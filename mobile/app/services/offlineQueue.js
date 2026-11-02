// Offline write-queue for production entries.
//
// When a submit fails because the device is offline, the entry is stored here
// and retried automatically when connectivity returns, so a shift log is never
// lost on a Wi-Fi blip. A tiny pub/sub lets the UI show a live pending count.

import { getJSON, setJSON } from "./storage";
import { api } from "./api";

const QUEUE_KEY = "inviu_pending_entries";

const listeners = new Set();
function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  }
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function getPending() {
  return getJSON(QUEUE_KEY, []);
}

export async function pendingCount() {
  return (await getPending()).length;
}

export async function enqueue(payload) {
  const queue = await getPending();
  const item = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    queuedAt: new Date().toISOString(),
  };
  queue.push(item);
  await setJSON(QUEUE_KEY, queue);
  notify();
  return item;
}

// Attempt to send every queued entry. Network failures are kept for retry;
// permanent server rejections (4xx) are dropped so they can't jam the queue.
// Returns { synced, dropped, remaining }.
export async function flushQueue() {
  const queue = await getPending();
  if (!queue.length) return { synced: 0, dropped: 0, remaining: 0 };

  let synced = 0;
  let dropped = 0;
  const stillPending = [];

  for (const item of queue) {
    try {
      await api.production.create(item.payload);
      synced += 1;
    } catch (err) {
      if (err && err.isNetworkError) {
        stillPending.push(item); // still offline — keep for next time
      } else if (err && err.status === 401) {
        stillPending.push(item); // auth expired — keep; will retry after re-login
      } else {
        dropped += 1; // server rejected it permanently; drop to avoid a jam
      }
    }
  }

  await setJSON(QUEUE_KEY, stillPending);
  notify();
  return { synced, dropped, remaining: stillPending.length };
}
