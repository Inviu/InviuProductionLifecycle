import { useEffect, useState } from "react";
import { subscribe, getState } from "../services/offlineQueue";

export function useOfflineQueue() {
  const [snap, setSnap] = useState(getState());
  useEffect(() => subscribe(setSnap), []);
  return snap; // { online, pending, failed, flushing }
}
