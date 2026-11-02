import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from 'react-native';

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  label: string;
  style?: ViewStyle;
}

export function TimePicker({ value, onChange, label, style }: TimePickerProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [hour, setHour] = React.useState(
    value ? parseInt(value.split(':')[0]) : 9
  );
  const [minute, setMinute] = React.useState(
    value ? parseInt(value.split(':')[1]) : 0
  );

  const handleConfirm = () => {
    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    onChange(formattedTime);
    setIsVisible(false);
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={styles.timeButton}
        onPress={() => setIsVisible(true)}
      >
        <MaterialIcons name="schedule" size={20} color="#1E3A5F" />
        <Text style={styles.timeText}>
          {value || 'Select time'}
        </Text>
      </TouchableOpacity>

      <Modal visible={isVisible} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.pickerContainer}>
            <View style={styles.header}>
              <Text style={styles.headerText}>Select Time</Text>
              <TouchableOpacity onPress={() => setIsVisible(false)}>
                <MaterialIcons name="close" size={24} color="#1E3A5F" />
              </TouchableOpacity>
            </View>

            <View style={styles.timeRow}>
              <ScrollView style={styles.column}>
                {Array.from({ length: 24 }, (_, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.timeOption,
                      hour === i && styles.selectedOption,
                    ]}
                    onPress={() => setHour(i)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        hour === i && styles.selectedText,
                      ]}
                    >
                      {String(i).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.separator}>:</Text>

              <ScrollView style={styles.column}>
                {Array.from({ length: 60 }, (_, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.timeOption,
                      minute === i && styles.selectedOption,
                    ]}
                    onPress={() => setMinute(i)}
                  >
                    <Text
                      style={[
                        styles.timeOptionText,
                        minute === i && styles.selectedText,
                      ]}
                    >
                      {String(i).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  timeText: {
    fontSize: 14,
    color: '#000000',
    marginLeft: 8,
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 300,
    paddingVertical: 16,
  },
  column: {
    flex: 1,
  },
  timeOption: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#F3F4F6',
  },
  timeOptionText: {
    fontSize: 18,
    color: '#D1D5DB',
  },
  selectedText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF8C00',
  },
  separator: {
    fontSize: 24,
    fontWeight: '700',
    marginHorizontal: 8,
    color: '#000000',
  },
  confirmButton: {
    backgroundColor: '#FF8C00',
    marginHorizontal: 16,
    marginBottom: 32,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
