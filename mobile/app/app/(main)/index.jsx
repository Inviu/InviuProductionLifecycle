import { ListItem } from '@/components/ListItem';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { SectionList, SafeAreaView, StyleSheet, ActivityIndicator, Text } from 'react-native';

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
      const data = await api.products.list();
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
        <SectionList
          sections={groupByCategory(products)}
          renderSectionHeader={({ section }) =>
            section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              description={item.description}
              onPress={() => handleSelectProduct(item)}
              icon="build"
            />
          )}
          keyExtractor={(item) => item.id.toString()}
          stickySectionHeadersEnabled={false}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

// Rod components / Sheet metal sections, in the order the server returns them.
function groupByCategory(products) {
  const sections = [];
  for (const p of products) {
    const title = p.category || '';
    let section = sections.find((s) => s.title === title);
    if (!section) {
      section = { title, data: [] };
      sections.push(section);
    }
    section.data.push(p);
  }
  return sections;
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A5F',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
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
