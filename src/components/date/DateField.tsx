import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { isValidDateString, parseLocalDate } from '../../lib/dates';
import { colors, radius, spacing, typography } from '../../theme';
import { CalendarSheet } from './CalendarSheet';

interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, or '' when nothing is chosen yet. */
  value: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  /** Month to open on when empty. */
  openTo?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** Tap-to-pick date input backed by the app calendar; dates are never typed. */
export function DateField({ label, value, onChange, minDate, maxDate, openTo, placeholder = 'Choose a date', disabled }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const valid = isValidDateString(value);
  const shown = valid ? parseLocalDate(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : placeholder;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { marginBottom: spacing.xs }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${valid ? shown : 'not set'}. Opens calendar`} accessibilityState={{ disabled: !!disabled }}
        disabled={disabled} onPress={() => setOpen(true)}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1 }}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={[typography.body, { flex: 1 }, !valid && { color: colors.textMuted }]}>{shown}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <CalendarSheet visible onClose={() => setOpen(false)} selectedDate={valid ? value : ''} onSelect={onChange}
        minDate={minDate} maxDate={maxDate} openTo={openTo} showHistory={false} /> : null}
    </View>
  );
}
