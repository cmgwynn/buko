import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useContext } from 'react';
import { runOnJS } from 'react-native-reanimated';
import { Pressable, Text, View } from 'react-native';
import { addLocalDays, mondayOfWeek, parseLocalDate, weekDates } from '../../lib/dates';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { colors, radius, spacing, typography } from '../../theme';
import { DaySwipeContext } from './DaySwipeContext';

export function WeekStrip() {
  const { selectedDate, setSelectedDate, today } = useSelectedDate();
  const parentSwipe = useContext(DaySwipeContext);
  const monday = mondayOfWeek(selectedDate);
  const dates = weekDates(selectedDate);
  const shiftWeek = (amount: number) => setSelectedDate(addLocalDays(selectedDate, amount));
  const swipe = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onEnd((event, successful) => {
      if (successful && Math.abs(event.translationX) > 48) runOnJS(shiftWeek)(event.translationX > 0 ? -7 : 7);
    });
  if (parentSwipe) swipe.blocksExternalGesture(parentSwipe);

  return (
    <GestureDetector gesture={swipe}>
      <View accessibilityLabel={`Week of ${monday}`} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md }}>
        {dates.map((date) => {
          const selected = date === selectedDate;
          const day = parseLocalDate(date);
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              onPress={() => setSelectedDate(date)}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: spacing.sm,
                flex: 1,
                maxWidth: 64,
                minHeight: 56,
                borderRadius: radius.md,
                backgroundColor: selected ? colors.primary : 'transparent',
              }}
            >
              <Text style={[typography.small, selected && { color: colors.onPrimary }]}>{day.toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
              <Text style={[
                typography.subheading,
                selected && { color: colors.onPrimary },
                date === today && !selected && { color: colors.primary },
              ]}>
                {day.getDate()}
              </Text>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 2, backgroundColor: selected ? colors.onPrimary : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </GestureDetector>
  );
}
