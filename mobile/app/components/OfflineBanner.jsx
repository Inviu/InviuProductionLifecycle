// Status bar for the offline completion queue: shows when the device is
// offline, when completions are waiting to sync, and when some couldn't be
// applied (surfaced for the operator to retry — never silently dropped).
import React from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function OfflineBanner() {
  const { pending, failed, syncing, isOnline, syncNow, retryFailed } = useOfflineSync();
  const insets = useSafeAreaInsets();

  const failedCount = failed?.length || 0;
  const offline = !isOnline;

  // Nothing to show when online, synced, and nothing failed.
  if (isOnline && pending === 0 && failedCount === 0 && !syncing) return null;

  const pad = { paddingBottom: 6 + insets.bottom };

  // Failed completions take priority — the operator needs to act on them.
  if (failedCount > 0) {
    return (
      <Pressable onPress={retryFailed} style={[styles.bar, { backgroundColor: "#991B1B" }, pad]}>
        <View style={styles.row}>
          <MaterialIcons name="error-outline" size={16} color="#FFFFFF" />
          <Text style={styles.text}>
            {failedCount} completion{failedCount === 1 ? "" : "s"} couldn&apos;t be applied — tap to retry
          </Text>
        </View>
      </Pressable>
    );
  }

  const bg = offline ? "#92400E" : "#1E40AF";
  let label;
  if (syncing) label = "Syncing…";
  else if (offline)
    label =
      pending > 0
        ? `Offline — ${pending} completion${pending === 1 ? "" : "s"} will sync when you're back`
        : "Offline — completions are saved and synced later";
  else label = `${pending} completion${pending === 1 ? "" : "s"} waiting to sync — tap to retry`;

  return (
    <Pressable onPress={syncNow} style={[styles.bar, { backgroundColor: bg }, pad]}>
      <View style={styles.row}>
        {syncing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name={offline ? "cloud-off" : "sync"} size={16} color="#FFFFFF" />
        )}
        <Text style={styles.text}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { width: "100%", paddingVertical: 6, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  text: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
});
