import { Button } from '@/components/Button';
import { DayPicker, ReadonlyField, SubSection, SuggestionChips, YesNo, isoDay } from '@/components/FormBits';
import { TextInputField } from '@/components/TextInputField';
import { TimePicker } from '@/components/TimePicker';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';
import { enqueue } from '@/services/offlineQueue';
import { getJSON, setJSON } from '@/services/storage';
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

const LAST_WORKER_KEY = 'lastWorkerName';
const BREAKDOWN_REASONS = ['Machine fault', 'Tool / die issue', 'Power cut', 'Material shortage', 'Maintenance'];

// What each step's form asks for, from the shop-floor sheets.
function formSpec(step, product) {
  const type = step?.formType || 'machining';
  const name = (step?.name || '').toLowerCase();
  const sheetMetal = (product?.category || '').toLowerCase().includes('sheet');

  let unitsLabel = 'Total pcs made';
  if (type === 'machining' && name === 'blanking') unitsLabel = 'Total parts stamped';
  else if (type === 'machining' && sheetMetal) unitsLabel = 'Total parts made';
  else if (type === 'count' && name === 'dispatched') unitsLabel = 'Total pcs dispatched';
  else if (type === 'count' && name === 'ready for dispatch') unitsLabel = 'Total parts for dispatch';
  else if (type === 'count') unitsLabel = 'Number of units';
  else if (type === 'packing') unitsLabel = 'Total units packed';

  return {
    type,
    unitsLabel,
    breakdown: type === 'machining' || type === 'machining_bits',
    bits: type === 'machining_bits',
    inspection: type === 'inspection',
    boxes: type === 'packing',
    rejectionsLabel: name.includes('after plating') ? 'Plating rejections' : 'Rejections (measurement)',
  };
}

const isWhole = (s) => /^\d+$/.test(String(s).trim());

export default function ProductionEntryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { appState, addProductionEntry } = useApp();
  const spec = formSpec(appState.selectedProcess, appState.selectedProduct);

  const [workerName, setWorkerName] = useState('');
  const [day, setDay] = useState(isoDay(new Date()));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [units, setUnits] = useState('');
  const [inspected, setInspected] = useState('');
  const [rejections, setRejections] = useState('');
  const [boxes, setBoxes] = useState('');
  const [breakdown, setBreakdown] = useState(null);
  const [bdStart, setBdStart] = useState('');
  const [bdEnd, setBdEnd] = useState('');
  const [bdReason, setBdReason] = useState('');
  const [bitChange, setBitChange] = useState(null);
  const [bits, setBits] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const discardConfirmedRef = React.useRef(false);

  // Prefill the last worker name used on this device.
  useEffect(() => {
    getJSON(LAST_WORKER_KEY, '').then((n) => n && setWorkerName((cur) => cur || n));
  }, []);

  const hasFormData = Boolean(
    startTime || endTime || units.trim() || inspected.trim() || rejections.trim() || boxes.trim() ||
      breakdown || bitChange
  );

  const good =
    isWhole(inspected) && (rejections.trim() === '' || isWhole(rejections))
      ? Number(inspected) - Number(rejections || 0)
      : null;

  const showUnsavedAlert = useCallback(
    (navigationAction) => {
      Alert.alert('Unsaved Changes', 'You have unsaved changes. Are you sure you want to leave?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discardConfirmedRef.current = true;
            if (navigationAction?.type === 'GO_BACK') router.back();
            else router.replace('/');
          },
        },
      ]);
    },
    [router]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (hasFormData && !discardConfirmedRef.current) {
        e.preventDefault();
        showUnsavedAlert(e.data.action);
      } else if (discardConfirmedRef.current) {
        discardConfirmedRef.current = false;
      }
    });
    return unsubscribe;
  }, [navigation, hasFormData, showUnsavedAlert]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hasFormData && !discardConfirmedRef.current) {
          showUnsavedAlert({ type: 'GO_BACK' });
          return true;
        }
        if (discardConfirmedRef.current) discardConfirmedRef.current = false;
        return false;
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

  const fail = (msg) => {
    Alert.alert('Check the form', msg);
    return null;
  };

  // Validate and build the API payload; returns null (after alerting) if invalid.
  const buildPayload = () => {
    if (!workerName.trim()) return fail('Enter the worker name.');
    if (!startTime) return fail('Select the start time.');
    if (!endTime) return fail('Select the end time.');
    if (startTime === endTime) return fail('Start and end time cannot be the same.');

    const payload = {
      productId: appState.selectedProduct.id,
      processId: appState.selectedProcess.id,
      machineId: appState.selectedMachine?.id || null,
      workerName: workerName.trim(),
      date: day,
      shiftStartTime: startTime,
      shiftEndTime: endTime,
    };

    if (spec.inspection) {
      if (!isWhole(inspected) || Number(inspected) <= 0) return fail('Enter the total units inspected.');
      if (rejections.trim() && !isWhole(rejections)) return fail(`Enter a valid number for ${spec.rejectionsLabel.toLowerCase()}.`);
      if (Number(rejections || 0) > Number(inspected)) return fail('Rejections cannot be more than units inspected.');
      payload.unitsInspected = Number(inspected);
      payload.rejectedUnits = Number(rejections || 0);
    } else {
      if (!isWhole(units)) return fail(`Enter ${spec.unitsLabel.toLowerCase()}.`);
      // Zero output is only valid for a shift lost to a breakdown.
      if (Number(units) === 0 && !breakdown) return fail(`${spec.unitsLabel} must be more than 0.`);
      payload.unitsProduced = Number(units);
    }

    if (spec.boxes) {
      if (!isWhole(boxes)) return fail('Enter the number of boxes.');
      payload.boxes = Number(boxes);
    }

    if (spec.breakdown) {
      if (breakdown === null) return fail('Was there a breakdown? Select Yes or No.');
      if (breakdown) {
        if (!bdStart || !bdEnd) return fail('Select the breakdown start and end time.');
        if (!bdReason.trim()) return fail('Enter the breakdown reason.');
        payload.breakdownStartTime = bdStart;
        payload.breakdownEndTime = bdEnd;
        payload.downtimeReason = bdReason.trim();
      }
    }

    if (spec.bits) {
      if (bitChange === null) return fail('Was there a bit change? Select Yes or No.');
      if (bitChange) {
        if (!isWhole(bits) || Number(bits) <= 0) return fail('Enter the number of bits changed.');
        payload.bitsChanged = Number(bits);
      } else {
        payload.bitsChanged = 0;
      }
    }
    return payload;
  };

  const resetAndReturn = () => {
    setStartTime('');
    setEndTime('');
    setUnits('');
    setInspected('');
    setRejections('');
    setBoxes('');
    setBreakdown(null);
    setBdStart('');
    setBdEnd('');
    setBdReason('');
    setBitChange(null);
    setBits('');
    discardConfirmedRef.current = true;
    router.back();
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setJSON(LAST_WORKER_KEY, payload.workerName);
    setIsLoading(true);
    try {
      const data = await api.production.create(payload);
      addProductionEntry(data);
      setIsLoading(false);
      Alert.alert('Saved', 'Production entry saved.', [{ text: 'OK', onPress: resetAndReturn }]);
    } catch (error) {
      setIsLoading(false);
      if (error && error.isNetworkError) {
        await enqueue(payload);
        addProductionEntry(payload);
        Alert.alert(
          'Saved offline',
          "No connection right now — this entry is saved on the device and will sync automatically when you're back online.",
          [{ text: 'OK', onPress: resetAndReturn }]
        );
      } else {
        Alert.alert('Not saved', (error && error.message) || 'Failed to save production entry');
      }
    }
  };

  const handleCancel = () => {
    if (!hasFormData) return router.back();
    Alert.alert('Unsaved Changes', 'Are you sure you want to cancel? Your progress will be lost.', [
      { text: 'No' },
      {
        text: 'Yes, Discard',
        style: 'destructive',
        onPress: () => {
          discardConfirmedRef.current = true;
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.header}>
          <Text style={styles.detailsText}>
            {appState.selectedProduct?.name} → {appState.selectedProcess?.name}
            {appState.selectedMachine ? ` → ${appState.selectedMachine.name}` : ''}
          </Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <TextInputField
              label="Worker Name"
              placeholder="Enter worker name"
              value={workerName}
              onChangeText={setWorkerName}
            />

            <DayPicker value={day} onChange={setDay} />

            <View style={styles.timeRow}>
              <TimePicker label="Start Time" value={startTime} onChange={setStartTime} style={styles.half} />
              <TimePicker label="End Time" value={endTime} onChange={setEndTime} style={styles.half} />
            </View>
            {startTime && endTime && endTime < startTime ? (
              <Text style={styles.note}>Ends after midnight — logged as a night shift.</Text>
            ) : null}

            {spec.inspection ? (
              <>
                <TextInputField
                  label="Total units inspected"
                  placeholder="0"
                  value={inspected}
                  onChangeText={setInspected}
                  keyboardType="number-pad"
                />
                <TextInputField
                  label={spec.rejectionsLabel}
                  placeholder="0"
                  value={rejections}
                  onChangeText={setRejections}
                  keyboardType="number-pad"
                />
                <ReadonlyField
                  label="Good parts"
                  value={good != null && good >= 0 ? String(good) : '—'}
                  hint="Inspected minus rejections"
                />
              </>
            ) : (
              <TextInputField
                label={spec.unitsLabel}
                placeholder="0"
                value={units}
                onChangeText={setUnits}
                keyboardType="number-pad"
              />
            )}

            {spec.boxes ? (
              <TextInputField
                label="Number of boxes"
                placeholder="0"
                value={boxes}
                onChangeText={setBoxes}
                keyboardType="number-pad"
              />
            ) : null}

            {spec.breakdown ? (
              <>
                <YesNo label="Breakdown" value={breakdown} onChange={setBreakdown} />
                {breakdown ? (
                  <SubSection>
                    <View style={styles.timeRow}>
                      <TimePicker label="Breakdown start" value={bdStart} onChange={setBdStart} style={styles.half} />
                      <TimePicker label="Breakdown end" value={bdEnd} onChange={setBdEnd} style={styles.half} />
                    </View>
                    <TextInputField
                      label="Reason"
                      placeholder="What went wrong?"
                      value={bdReason}
                      onChangeText={setBdReason}
                    />
                    <SuggestionChips options={BREAKDOWN_REASONS} onPick={setBdReason} />
                  </SubSection>
                ) : null}
              </>
            ) : null}

            {spec.bits ? (
              <>
                <YesNo label="Bit change" value={bitChange} onChange={setBitChange} alarm={false} />
                {bitChange ? (
                  <SubSection>
                    <TextInputField
                      label="Number of bits"
                      placeholder="0"
                      value={bits}
                      onChangeText={setBits}
                      keyboardType="number-pad"
                    />
                  </SubSection>
                ) : null}
              </>
            ) : null}

            <View style={styles.buttonGroup}>
              <Button
                title={isLoading ? 'Submitting...' : 'Submit'}
                onPress={handleSubmit}
                disabled={isLoading}
                variant="success"
              />
              <Button title="Cancel" onPress={handleCancel} disabled={isLoading} variant="danger" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  keyboardView: { flex: 1 },
  header: { backgroundColor: '#1E3A5F', paddingVertical: 8, paddingHorizontal: 16 },
  detailsText: { fontSize: 13, color: '#FFFFFF', fontWeight: '500' },
  content: { flex: 1 },
  form: { padding: 16, paddingBottom: 40 },
  timeRow: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  note: { fontSize: 12, color: '#6B7280', marginTop: -6 },
  buttonGroup: { marginTop: 16, gap: 8 },
  errorText: { fontSize: 16, color: '#DC2626', textAlign: 'center', marginTop: 20 },
});
