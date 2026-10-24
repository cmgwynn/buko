import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addLocalDays, mondayOfWeek, parseLocalDate } from '../../lib/dates';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { colors, spacing, typography } from '../../theme';
import { CalendarSheet } from './CalendarSheet';
import { WeekStrip } from './WeekStrip';

export function DateNavigator() {
  const { selectedDate, setSelectedDate, today, goToday } = useSelectedDate();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const monday = mondayOfWeek(selectedDate);
  const sunday = addLocalDays(monday, 6);
  const first = parseLocalDate(monday);
  const last = parseLocalDate(sunday);
  const weekLabel = `${first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
        <Pressable accessibilityRole="button" onPress={() => setSelectedDate(addLocalDays(selectedDate, -7))} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }} accessibilityLabel="Previous week">
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open calendar for ${selectedDate}`} onPress={() => setCalendarVisible(true)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
          <Text style={typography.subheading}>{weekLabel}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setSelectedDate(addLocalDays(selectedDate, 7))} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }} accessibilityLabel="Next week">
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
      </View>
      <WeekStrip />
      <Pressable accessibilityRole="button" onPress={goToday} style={{ alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
        <Text style={[typography.small, { color: selectedDate === today ? colors.textMuted : colors.primary, fontWeight: '700' }]}>Today</Text>
      </Pressable>
      <CalendarSheet visible={calendarVisible} onClose={() => setCalendarVisible(false)} />
    </View>
  );
}
