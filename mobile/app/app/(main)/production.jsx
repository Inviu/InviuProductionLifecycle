import { Button } from '@/components/Button';
import { ReasonSelector } from '@/components/ReasonSelector';
import { TextInputField } from '@/components/TextInputField';
import { TimePicker } from '@/components/TimePicker';
import { useApp } from '@/context/AppContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import React, { useState, useCallback, useEffect } from 'react';
import {
    Alert,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export default function ProductionEntryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { appState, addProductionEntry, resetSelection } = useApp();
  
  const [workerName, setWorkerName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [unitsProduced, setUnitsProduced] = useState('');
  const [reasons, setReasons] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track if user confirmed discard to prevent alert loop
  const discardConfirmedRef = React.useRef(false);

  // Check if form has any data
  const hasFormData = workerName.trim() || startTime || endTime || unitsProduced.trim() || reasons.length > 0;

  const showUnsavedAlert = useCallback((navigationAction) => {
    Alert.alert(
      'Unsaved Changes',
      'You have unsaved changes. Are you sure you want to leave?',
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Discard',
          onPress: () => {
            discardConfirmedRef.current = true;
            // If navigation action is GO_BACK, use router.back()
            // Otherwise (home/tab navigation), go to home page (product selection)
            if (navigationAction?.type === 'GO_BACK') {
              router.back();
            } else {
              router.replace('/');
            }
          },
          style: 'destructive',
        },
      ]
    );
  }, [router]);

  // Handle navigation attempts (back button, home button, etc.)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (hasFormData && !discardConfirmedRef.current) {
        e.preventDefault();
        showUnsavedAlert(e.data.action);
      } else if (discardConfirmedRef.current) {
        // Reset the flag after navigation is confirmed
        discardConfirmedRef.current = false;
      }
    });

    return unsubscribe;
  }, [navigation, hasFormData, showUnsavedAlert]);

  // Handle back button and navigation
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasFormData && !discardConfirmedRef.current) {
          // For hardware back press, pass GO_BACK action to use router.back()
          showUnsavedAlert({ type: 'GO_BACK' });
          return true; // Prevent default back behavior
        }
        if (discardConfirmedRef.current) {
          discardConfirmedRef.current = false;
        }
        return false; // Allow default back behavior
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [hasFormData, showUnsavedAlert])
  );

  if (!appState.selectedProduct || !appState.selectedProcess) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Invalid selection. Please start over.</Text>
      </SafeAreaView>
    );
  }

  const handleSubmit = async () => {
    // Validation
    if (!workerName.trim()) {
      Alert.alert('Error', 'Please enter worker name');
      return;
    }
    if (!startTime) {
      Alert.alert('Error', 'Please select start time');
      return;
    }
    if (!endTime) {
      Alert.alert('Error', 'Please select end time');
      return;
    }
    if (!unitsProduced.trim() || isNaN(Number(unitsProduced))) {
      Alert.alert('Error', 'Please enter valid units produced');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('https://invuie-api.onrender.com/api/createProductionEntry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: appState.selectedProduct.id,
          processId: appState.selectedProcess.id,
          machineId: appState.selectedMachine?.id || null,
          workerName: workerName.trim(),
          shiftStartTime: startTime,
          shiftEndTime: endTime,
          unitsProduced: Number(unitsProduced),
          productionIssueReason: reasons.length > 0 ? reasons : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create production entry');
      }

      const data = await response.json();
      addProductionEntry(data);
      setIsLoading(false);

      Alert.alert('Success', 'Production entry saved successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Reset form and go back to machine screen
            setWorkerName('');
            setStartTime('');
            setEndTime('');
            setUnitsProduced('');
            setReasons([]);
            router.back();
          },
        },
      ]);
    } catch (error) {
      setIsLoading(false);
      Alert.alert('Error', error.message || 'Failed to save production entry');
    }
  };

  const handleCancel = () => {
    if (hasFormData) {
      Alert.alert('Unsaved Changes', 'Are you sure you want to cancel? Your progress will be lost.', [
        { text: 'No', onPress: () => {} },
        {
          text: 'Yes, Discard',
          onPress: () => {
            router.back();
          },
          style: 'destructive',
        },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View style={styles.headerDetails}>
            <Text style={styles.detailsText}>
              {appState.selectedProduct?.name} → {appState.selectedProcess?.name}
              {appState.selectedMachine ? ` → ${appState.selectedMachine.name}` : ''}
            </Text>
          </View>
        </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <TextInputField
            label="Worker Name"
            placeholder="Enter worker name"
            value={workerName}
            onChangeText={setWorkerName}
          />

          <TimePicker
            label="Start Time"
            value={startTime}
            onChange={setStartTime}
          />

          <TimePicker
            label="End Time"
            value={endTime}
            onChange={setEndTime}
          />

          <TextInputField
            label="Units Produced"
            placeholder="Enter number of units"
            value={unitsProduced}
            onChangeText={setUnitsProduced}
            keyboardType="decimal-pad"
          />

          <ReasonSelector
            selectedReasons={reasons}
            onReasonsChange={setReasons}
          />

          <View style={styles.buttonGroup}>
            <Button
              title={isLoading ? 'Submitting...' : 'Submit'}
              onPress={handleSubmit}
              disabled={isLoading}
              variant="success"
            />
            <Button
              title="Cancel"
              onPress={handleCancel}
              disabled={isLoading}
              variant="danger"
            />
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1E3A5F',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerDetails: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    marginTop: 0,
  },
  detailsText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#E6F4FE',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  buttonGroup: {
    marginTop: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 20,
  },
});
