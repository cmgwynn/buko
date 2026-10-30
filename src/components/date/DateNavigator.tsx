import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addLocalDays, parseLocalDate } from '../../lib/dates';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { colors, radius, spacing, typography } from '../../theme';
import { CalendarSheet } from './CalendarSheet';
import { WeekStrip } from './WeekStrip';

function relativeTitle(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addLocalDays(today, -1)) return 'Yesterday';
  if (date === addLocalDays(today, 1)) return 'Tomorrow';
  return parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function DateNavigator() {
  const { selectedDate, setSelectedDate, today, goToday } = useSelectedDate();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const onToday = selectedDate === today;
  const full = parseLocalDate(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open calendar for ${selectedDate}`} accessibilityHint="Pick any date"
          onPress={() => setCalendarVisible(true)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text style={typography.heading} numberOfLines={1}>{relativeTitle(selectedDate, today)}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.primary} />
          </View>
          <Text style={typography.small} numberOfLines={1}>{full}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Today" accessibilityState={{ selected: onToday }} onPress={goToday} hitSlop={4}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill,
            backgroundColor: onToday ? colors.primarySoft : colors.primary,
          }}>
          <Ionicons name="today-outline" size={16} color={onToday ? colors.primary : colors.onPrimary} />
          <Text style={[typography.label, { color: onToday ? colors.primary : colors.onPrimary }]}>Today</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSelectedDate(addLocalDays(selectedDate, -7))} accessibilityLabel="Previous week"
          style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSelectedDate(addLocalDays(selectedDate, 7))} accessibilityLabel="Next week"
          style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <WeekStrip />
      <CalendarSheet visible={calendarVisible} onClose={() => setCalendarVisible(false)} />
    </View>
  );
}
