import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const PRODUCTION_REASONS = [
  'Machine Breakdown',
  'Worker Absent',
  'Power Outage',
  'Material Shortage',
  'Equipment Maintenance',
  'Quality Control Issues',
  'Shift Changeover',
  'No Production Needed',
];

interface ReasonSelectorProps {
  selectedReasons: string[];
  onReasonsChange: (reasons: string[]) => void;
}

export const ReasonSelector: React.FC<ReasonSelectorProps> = ({
  selectedReasons,
  onReasonsChange,
}) => {
  const toggleReason = (reason: string) => {
    if (selectedReasons.includes(reason)) {
      onReasonsChange(selectedReasons.filter((r) => r !== reason));
    } else {
      onReasonsChange([...selectedReasons, reason]);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Reasons for Production Issues (if any)</Text>
      <Text style={styles.sublabel}>Select all that apply</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.reasonsScroll}
      >
        <View style={styles.reasonsContainer}>
          {PRODUCTION_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              style={[
                styles.reasonChip,
                selectedReasons.includes(reason) && styles.reasonChipSelected,
              ]}
              onPress={() => toggleReason(reason)}
            >
              <MaterialIcons
                name={
                  selectedReasons.includes(reason) ? 'check-circle' : 'circle'
                }
                size={18}
                color={selectedReasons.includes(reason) ? '#FF8C00' : '#999999'}
              />
              <Text
                style={[
                  styles.reasonText,
                  selectedReasons.includes(reason) && styles.reasonTextSelected,
                ]}
              >
                {reason}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 4,
  },
  sublabel: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 12,
  },
  reasonsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  reasonsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reasonChipSelected: {
    backgroundColor: '#F3F4F6',
    borderColor: '#FF8C00',
  },
  reasonText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  reasonTextSelected: {
    color: '#FF8C00',
    fontWeight: '600',
  },
});
