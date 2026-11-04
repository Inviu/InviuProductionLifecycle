import React from 'react';
import {
    KeyboardTypeOptions,
    StyleSheet,
    Text,
    TextInput,
    View,
    ViewStyle,
} from 'react-native';

interface TextInputFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  style?: ViewStyle;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}

export function TextInputField({
  label,
  placeholder,
  value,
  onChangeText,
  style,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  autoCapitalize,
  autoCorrect,
}: TextInputFieldProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        placeholder={placeholder || label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={numberOfLines}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        placeholderTextColor="#CCCCCC"
      />
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
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    backgroundColor: '#FFFFFF',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
