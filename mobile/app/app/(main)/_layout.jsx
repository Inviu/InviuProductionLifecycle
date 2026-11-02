import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function MainLayout() {
  const router = useRouter();
  const { resetSelection } = useApp();
  const { logout } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);

  const handleLogout = () => {
    setMenuVisible(false);
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Logout',
        onPress: () => logout(),
        style: 'destructive',
      },
    ]);
  };

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: true,
          headerBackVisible: false,
          headerStyle: {
            backgroundColor: '#1E3A5F',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '600',
          },
          headerLeft: ({ tintColor }) => (
            <Pressable
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={tintColor} />
            </Pressable>
          ),
          headerRight: ({ tintColor }) => (
            <View style={styles.headerRightContainer}>
              <Pressable
                onPress={() => {
                  router.replace('/');
                }}
                style={styles.headerButton}
              >
                <MaterialIcons name="home" size={24} color={tintColor} />
              </Pressable>
              <Pressable
                onPress={() => setMenuVisible(true)}
                style={styles.headerButton}
              >
                <MaterialIcons name="menu" size={24} color={tintColor} />
              </Pressable>
            </View>
          ),
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'Select Product',
            headerLeft: () => null,
          }} 
        />
        <Stack.Screen name="process" options={{ title: 'Select Process' }} />
        <Stack.Screen name="machine" options={{ title: 'Select Machine' }} />
        <Stack.Screen name="production" options={{ title: 'Production Entry' }} />
      </Stack>

      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <SafeAreaView style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <Pressable onPress={() => setMenuVisible(false)}>
                <MaterialIcons name="close" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={{ flex: 1 }} />

            <Pressable
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <MaterialIcons name="logout" size={24} color="#DC2626" />
              <Text style={styles.menuItemText}>Logout</Text>
            </Pressable>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    padding: 8,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E3A5F',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#DC2626',
    marginLeft: 16,
  },
});
