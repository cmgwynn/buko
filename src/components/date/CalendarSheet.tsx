import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { addLocalDays, addLocalMonths, assertDateString, formatLocalDate, localDateStartIso, monthRange, parseLocalDate } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useSelectedDate } from '../../providers/SelectedDateProvider';
import { colors, radius, spacing, typography } from '../../theme';
import { subscribeToDateHistoryInvalidation } from './dateHistory';
import { loadHistoryPages } from './historyPages';

interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedDate?: string;
  onSelect?: (date: string) => void;
  maxDate?: string;
}

export function CalendarSheet({ visible, onClose, selectedDate: selectedDateProp, onSelect, maxDate: maxDateProp }: CalendarSheetProps) {
  const { session } = useAuth();
  const reducedMotion = useReducedMotion();
  const context = useSelectedDate();
  const selectedDate = assertDateString(selectedDateProp ?? context.selectedDate);
  const selectDate = onSelect ?? context.setSelectedDate;
  const maxDate = maxDateProp == null ? null : assertDateString(maxDateProp);
  const today = context.today;
  const [month, setMonth] = useState(() => `${selectedDate.slice(0, 7)}-01`);
  const [foodDays, setFoodDays] = useState<Set<string>>(() => new Set());
  const [workoutDays, setWorkoutDays] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const range = useMemo(() => monthRange(month), [month]);
  const historyKey = `${session?.user.id ?? ''}:${range.start}:${range.end}:${visible}`;
  const currentHistoryKey = useRef(historyKey);
  currentHistoryKey.current = historyKey;
  const reloadHistory = useCallback(async () => {
    const request = ++requestId.current;
    const isCurrent = () => request === requestId.current && currentHistoryKey.current === historyKey;
    if (!visible || !session) {
      setFoodDays(new Set());
      setWorkoutDays(new Set());
      setError(null);
      setLoading(false);
      setLoadedKey(null);
      return;
    }
    setLoading(true);
    setFoodDays(new Set());
    setWorkoutDays(new Set());
    setError(null);
    try {
      const from = localDateStartIso(range.start);
      const until = localDateStartIso(addLocalDays(range.end, 1));
      const [foodRows, workoutRows] = await Promise.all([
        loadHistoryPages<{ logged_on: string }>((first, last) =>
          supabase.from('food_log_entries').select('logged_on').eq('user_id', session.user.id)
            .gte('logged_on', range.start).lte('logged_on', range.end).order('id').range(first, last), isCurrent),
        loadHistoryPages<{ started_at: string }>((first, last) =>
          supabase.from('workouts').select('started_at').eq('user_id', session.user.id)
            .gte('started_at', from).lt('started_at', until).order('id').range(first, last), isCurrent),
      ]);
      if (!isCurrent() || !foodRows || !workoutRows) return;
      setFoodDays(new Set(foodRows.map((row) => row.logged_on)));
      setWorkoutDays(new Set(workoutRows.map((row) => formatLocalDate(new Date(row.started_at)))));
      setLoadedKey(historyKey);
      setError(null);
    } catch (err) {
      if (isCurrent()) setError(`Could not load date history: ${(err as Error).message}`);
    }
    if (isCurrent()) setLoading(false);
  }, [historyKey, range.end, range.start, session, visible]);

  useEffect(() => {
    if (visible) setMonth(`${selectedDate.slice(0, 7)}-01`);
  }, [selectedDate, visible]);

  useEffect(() => {
    void reloadHistory();
    return () => { requestId.current += 1; };
  }, [reloadHistory]);

  useEffect(() => subscribeToDateHistoryInvalidation(() => { void reloadHistory(); }), [reloadHistory]);

  const monthDate = parseLocalDate(month);
  const daysInMonth = Number(monthRange(month).end.slice(-2));
  const offset = (monthDate.getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  function selectDay(day: number) {
    const date = `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    if (maxDate && date > maxDate) return;
    selectDate(date);
    onClose();
  }

  function changeMonth(offsetMonths: number) {
    setMonth(`${addLocalMonths(month, offsetMonths).slice(0, 7)}-01`);
  }

  function changeYear(offsetYears: number) {
    changeMonth(offsetYears * 12);
  }

  return (
    <Modal testID="date-calendar-sheet" transparent visible={visible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close calendar" onPress={onClose} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xxl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous year" disabled={month.slice(0, 4) <= '1900'} onPress={() => changeYear(-1)} style={{ minWidth: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" disabled={month <= '1900-01-01'} onPress={() => changeMonth(-1)} style={{ minWidth: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={22} color={colors.primary} />
            </Pressable>
            <Text accessibilityLiveRegion="polite" style={[typography.subheading, { flex: 1, textAlign: 'center' }]}>
              {monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={month >= '2100-12-01'} onPress={() => changeMonth(1)} style={{ minWidth: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={22} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Next year" disabled={month.slice(0, 4) >= '2100'} onPress={() => changeYear(1)} style={{ minWidth: 42, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.xs }}>
            {weekdays.map((weekday, index) => <Text key={`${weekday}-${index}`} style={[typography.label, { width: '13%', textAlign: 'center' }]}>{weekday}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, index) => {
              if (day == null) return <View key={`blank-${index}`} style={{ width: '14.28%', height: 48 }} />;
              const date = `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`;
              const selected = date === selectedDate;
              const disabled = date < '1900-01-01' || date > '2100-12-31' || (maxDate != null && date > maxDate);
              const hasFood = loadedKey === historyKey && foodDays.has(date);
              const hasWorkout = loadedKey === historyKey && workoutDays.has(date);
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${hasFood ? ', food logged' : ''}${hasWorkout ? ', workout logged' : ''}`}
                  onPress={() => selectDay(day)}
                  disabled={disabled}
                  style={{ width: '14.28%', height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: selected ? colors.primary : 'transparent', opacity: disabled ? 0.35 : 1 }}
                >
                  <Text style={[typography.body, selected && { color: colors.onPrimary }, date === today && !selected && { color: colors.primary, fontWeight: '700' }]}>{day}</Text>
                  <View style={{ flexDirection: 'row', height: 5, gap: 3, marginTop: 1 }}>
                    {hasFood ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: selected ? colors.onPrimary : colors.macro.calories }} /> : null}
                    {hasWorkout ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: selected ? colors.onPrimary : colors.macro.protein }} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {loading ? <Text style={[typography.small, { marginTop: spacing.sm }]}>Loading date history…</Text> : null}
          {error ? <Text accessibilityRole="alert" style={[typography.small, { color: colors.danger, marginTop: spacing.sm }]}>{error}</Text> : null}
          <Text style={[typography.small, { marginTop: spacing.sm }]}>Dots mark days with food or workouts logged. Future dates are available for planning.</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={{ alignSelf: 'flex-end', marginTop: spacing.md, padding: spacing.sm }}>
            <Text style={[typography.body, { color: colors.primary }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
