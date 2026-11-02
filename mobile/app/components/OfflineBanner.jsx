// Shows a thin status bar when the device is offline or has production entries
// waiting to sync. Tapping it forces a sync attempt.
import React from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function OfflineBanner() {
  const { pending, syncing, isOnline, syncNow } = useOfflineSync();
  const insets = useSafeAreaInsets();

  // Nothing to show when online and fully synced.
  if (isOnline && pending === 0 && !syncing) return null;

  const offline = !isOnline;
  const bg = offline ? "#92400E" : "#1E40AF";

  let label;
  if (syncing) label = "Syncing…";
  else if (offline)
    label =
      pending > 0
        ? `Offline — ${pending} entr${pending === 1 ? "y" : "ies"} will sync when you're back`
        : "Offline — entries will be saved and synced later";
  else label = `${pending} entr${pending === 1 ? "y" : "ies"} waiting to sync — tap to retry`;

  return (
    <Pressable
      onPress={syncNow}
      style={[styles.bar, { backgroundColor: bg, paddingBottom: 6 + insets.bottom }]}
    >
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
