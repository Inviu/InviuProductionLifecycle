import { ListItem } from '@/components/ListItem';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';

export default function MachineSelectionScreen() {
  const router = useRouter();
  const { appState, setSelectedMachine } = useApp();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (appState.selectedProcess) {
      fetchMachines();
    }
  }, [appState.selectedProcess]);

  const fetchMachines = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://invuie-api.onrender.com/api/getMachines/${appState.selectedProcess.id}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch machines');
      }
      const data = await response.json();
      
      // Check if machines array is empty or not provided
      const machinesList = Array.isArray(data) ? data : (data.machines || []);
      
      if (machinesList.length === 0) {
        // If no machines available for this process, navigate to production directly
        setSelectedMachine(null);
        setMachines([]);
        router.replace({
          pathname: '/(main)/production',
        });
        return;
      }
      
      setMachines(machinesList);
      setError(null);
    } catch (err) {
      console.error('Error fetching machines:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMachine = (machine) => {
    setSelectedMachine(machine);
    router.push({
      pathname: '/(main)/production',
    });
  };

  if (!appState.selectedProcess) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No process selected</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.breadcrumb}>
          {appState.selectedProduct?.name} → {appState.selectedProcess.name} → Select Machine
        </Text>
      </View>

      {loading && (
        <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
      )}
      {error && (
        <Text style={styles.errorText}>Error: {error}</Text>
      )}
      {!loading && !error && (
        <FlatList
          data={machines}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              description={item.description}
              onPress={() => handleSelectMachine(item)}
              icon="memory"
            />
          )}
          keyExtractor={(item) => item.id.toString()}
          scrollEnabled={true}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  header: {
    backgroundColor: '#1E3A5F',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  breadcrumb: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  list: {
    flex: 1,
    marginTop: 12,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 20,
  },
});
