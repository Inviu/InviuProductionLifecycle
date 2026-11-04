// Small form controls for the shift-log screen. Pure JS (no native modules),
// so they ship over the air without rebuilding the APK.
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const NAVY = '#1E3A5F';
const ORANGE = '#FF8C00';

/** Two-button Yes / No toggle. value: true | false | null. alarm: Yes shows red. */
export function YesNo({ label, value, onChange, alarm = true }) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {[
          { text: 'No', v: false },
          { text: 'Yes', v: true },
        ].map((opt) => {
          const active = value === opt.v;
          return (
            <TouchableOpacity
              key={opt.text}
              style={[styles.segment, active && (opt.v ? (alarm ? styles.segmentYes : styles.segmentYesNeutral) : styles.segmentNo)]}
              onPress={() => onChange(opt.v)}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const pad = (n) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD. */
export function isoDay(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Date chips for the last `days` days, today first. value: YYYY-MM-DD. */
export function DayPicker({ label = 'Date', value, onChange, days = 7 }) {
  const options = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const text =
      i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return { text, v: isoDay(d) };
  });
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {options.map((o) => {
            const active = value === o.v;
            return (
              <TouchableOpacity
                key={o.v}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => onChange(o.v)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Quick-pick suggestion chips that fill a text field. */
export function SuggestionChips({ options, onPick }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -4 }}>
      <View style={styles.row}>
        {options.map((o) => (
          <TouchableOpacity key={o} style={styles.suggestion} onPress={() => onPick(o)}>
            <Text style={styles.suggestionText}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

/** A computed, read-only value shown like a field. */
export function ReadonlyField({ label, value, hint }) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.readonlyText}>{value}</Text>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A titled, indented group (e.g. the breakdown details). */
export function SubSection({ children }) {
  return <View style={styles.sub}>{children}</View>;
}

const styles = StyleSheet.create({
  block: { marginVertical: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
    alignItems: 'center',
    minWidth: 110,
  },
  segmentYes: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  segmentNo: { backgroundColor: NAVY, borderColor: NAVY },
  segmentYesNeutral: { backgroundColor: ORANGE, borderColor: ORANGE },
  segmentText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  segmentTextActive: { color: '#FFF' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
  },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E6EEF7',
  },
  suggestionText: { fontSize: 13, color: NAVY },
  readonly: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
  },
  readonlyText: { fontSize: 16, fontWeight: '700', color: '#065F46' },
  hint: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  sub: {
    borderLeftWidth: 3,
    borderLeftColor: '#FCA5A5',
    paddingLeft: 12,
    marginLeft: 4,
  },
});
