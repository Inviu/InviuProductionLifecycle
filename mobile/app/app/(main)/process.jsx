import { ListItem } from '@/components/ListItem';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';

export default function ProcessSelectionScreen() {
  const router = useRouter();
  const { appState, setSelectedProcess } = useApp();
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (appState.selectedProduct) {
      fetchProcesses();
    }
  }, [appState.selectedProduct]);

  const fetchProcesses = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `https://invuie-api.onrender.com/api/getprocess/${appState.selectedProduct.id}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch processes');
      }
      const data = await response.json();
      setProcesses(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching processes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!appState.selectedProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No product selected</Text>
      </SafeAreaView>
    );
  }

  const handleSelectProcess = (process) => {
    setSelectedProcess(process);
    router.push({
      pathname: '/(main)/machine',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.breadcrumb}>
          {appState.selectedProduct.name} → Select Process
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
          data={processes}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              description={item.description}
              onPress={() => handleSelectProcess(item)}
              icon="settings"
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
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 20,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
