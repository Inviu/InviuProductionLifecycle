import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const { resetSelection } = useApp();
  const { authState } = useAuth();
  const name = authState?.user?.name;

  const goWorkOrders = () => router.push('/(main)/work-orders');
  const goLogProduction = () => {
    resetSelection();
    router.push('/(main)/products');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {name ? <Text style={styles.greeting}>Hi, {name}</Text> : null}
        <Text style={styles.subtitle}>What are you working on?</Text>

        <Pressable
          style={({ pressed }) => [styles.card, styles.cardWork, pressed && styles.pressed]}
          onPress={goWorkOrders}
        >
          <MaterialIcons name="assignment" size={36} color="#FFFFFF" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Work Orders</Text>
            <Text style={styles.cardDesc}>Pick up assigned work and complete steps</Text>
          </View>
          <MaterialIcons name="chevron-right" size={28} color="#FFFFFF" />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.card, styles.cardLog, pressed && styles.pressed]}
          onPress={goLogProduction}
        >
          <MaterialIcons name="edit-note" size={40} color="#FFFFFF" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Log Production</Text>
            <Text style={styles.cardDesc}>Record a shift: product, machine, units, issues</Text>
          </View>
          <MaterialIcons name="chevron-right" size={28} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  content: { padding: 16, gap: 16 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#1E3A5F', marginTop: 8 },
  subtitle: { fontSize: 15, color: '#64748B', marginBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardWork: { backgroundColor: '#1E3A5F' },
  cardLog: { backgroundColor: '#0066CC' },
  pressed: { opacity: 0.85 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  cardDesc: { fontSize: 13, color: '#E6F0FA', marginTop: 4 },
});
