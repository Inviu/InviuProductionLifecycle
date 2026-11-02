// Watches connectivity and the offline completion queue. Auto-syncs queued
// work-order completions when the device comes back online, and exposes live
// pending/failed counts for the banner.
import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  getPending,
  getFailed,
  flushQueue,
  retryFailed as retryFailedQueue,
  dismissFailed as dismissFailedItem,
  subscribe,
} from "../services/offlineQueue";

export function useOfflineSync() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    setPending((await getPending()).length);
    setFailed(await getFailed());
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await flushQueue();
      await refresh();
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  const retryFailed = useCallback(async () => {
    await retryFailedQueue();
    await refresh();
  }, [refresh]);

  const dismissFailed = useCallback(
    async (localId) => {
      await dismissFailedItem(localId);
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    const unsub = subscribe(refresh);
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      setIsOnline(online);
      if (online) syncNow();
    });
    return () => {
      unsub();
      unsubscribeNet();
    };
  }, [refresh, syncNow]);

  return { pending, failed, syncing, isOnline, syncNow, retryFailed, dismissFailed };
}
