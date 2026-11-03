// Watches connectivity and the offline queue, auto-syncing pending production
// entries when the device comes back online, and exposing a live pending count.
import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { getPending, flushQueue, subscribe } from "../services/offlineQueue";

export function useOfflineSync() {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    setPending((await getPending()).length);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return { synced: 0, dropped: 0, remaining: 0 };
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushQueue();
      await refresh();
      return result;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [refresh]);

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

  return { pending, syncing, isOnline, syncNow };
}
