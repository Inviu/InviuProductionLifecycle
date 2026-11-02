import { api } from '@/services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function WorkOrdersScreen() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.operator.queue();
      setQueue(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load the queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the screen gains focus (e.g. after completing a step).
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const setQty = (item, raw) => {
    const max = Math.min(item.remaining, item.inventoryAvailable);
    const clamped = Math.min(Number(raw) || 0, max);
    setInputs((p) => ({ ...p, [item.orderProcessId]: clamped > 0 ? String(clamped) : '' }));
  };

  const complete = async (item) => {
    const qty = Number(inputs[item.orderProcessId]) || 0;
    if (qty <= 0) return;
    try {
      setBusyId(item.orderProcessId);
      await api.workOrders.complete(item.orderId, item.processId, qty);
      setInputs((p) => ({ ...p, [item.orderProcessId]: '' }));
      await load();
    } catch (err) {
      if (err && err.isNetworkError) {
        Alert.alert(
          'You are offline',
          'Work-order steps need a live connection (they update shared inventory). Reconnect and try again.'
        );
      } else {
        Alert.alert('Could not complete', err.message || 'Please try again.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }) => {
    const max = Math.min(item.remaining, item.inventoryAvailable);
    const val = inputs[item.orderProcessId] ?? '';
    const disabled = !val || busyId === item.orderProcessId || max <= 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.woTag}>
              WO-{String(item.orderId).padStart(3, '0')} · {item.customerName}
            </Text>
            <Text style={styles.processName}>{item.processName}</Text>
            <Text style={styles.productName}>{item.productName}</Text>
          </View>
          <View style={styles.counts}>
            <Text style={styles.remaining}>{item.remaining} left</Text>
            <Text style={styles.stock}>stock {item.inventoryAvailable}</Text>
          </View>
        </View>

        {item.machines && item.machines.length > 0 && (
          <View style={styles.chips}>
            {item.machines.map((m) => (
              <Text key={m.machineId} style={styles.chip}>
                {m.machineName}: {m.assignedQuantity}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.actionRow}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={val}
            onChangeText={(t) => setQty(item, t)}
            placeholder={`0 – ${max}`}
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity
            style={[styles.doneBtn, disabled && styles.doneBtnDisabled]}
            onPress={() => complete(item)}
            disabled={disabled}
          >
            {busyId === item.orderProcessId ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <FlatList
        data={queue}
        keyExtractor={(item) => String(item.orderProcessId)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <MaterialIcons name="check-circle" size={48} color="#22C55E" />
              <Text style={styles.emptyText}>Nothing to do right now.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  woTag: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  processName: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 2 },
  productName: { fontSize: 14, color: '#64748B' },
  counts: { alignItems: 'flex-end' },
  remaining: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  stock: { fontSize: 13, color: '#94A3B8' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
  },
  doneBtnDisabled: { backgroundColor: '#CBD5E1' },
  doneText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyText: { color: '#64748B', fontSize: 15 },
  errorText: { color: '#DC2626', textAlign: 'center', padding: 12 },
});
