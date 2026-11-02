import { ListItem } from '@/components/ListItem';
import { useApp } from '@/context/AppContext';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, SafeAreaView, StyleSheet, ActivityIndicator, Text } from 'react-native';

export default function ProductSelectionScreen() {
  const router = useRouter();
  const { setSelectedProduct } = useApp();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://invuie-api.onrender.com/api/getAllProducts');
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      const data = await response.json();
      setProducts(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    router.push({
      pathname: '/(main)/process',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {loading && (
        <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
      )}
      {error && (
        <Text style={styles.errorText}>Error: {error}</Text>
      )}
      {!loading && !error && (
        <FlatList
          data={products}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              description={item.description}
              onPress={() => handleSelectProduct(item)}
              icon="build"
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
  list: {
    flex: 1,
    marginTop: 0,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
});
