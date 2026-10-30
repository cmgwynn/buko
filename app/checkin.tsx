import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, ChipRow, Eyebrow, HeroCard, Loading, Notice, Screen } from '../src/components/ui';
import { addDays, formatDay } from '../src/lib/diary';
import { loadMeasurements, loadPlannedWorkouts, type PlannedWorkoutRow } from '../src/lib/fitness/data';
import { adaptiveTargetSuggestion } from '../src/lib/nutrition/insights';
import { mealAdvice, reviewWeek, summarizeWeek, trainingAdvice, type Feel } from '../src/lib/planning/checkin';
import { applyCheckin, checkinDone, markCheckinDone } from '../src/lib/planning/checkinClient';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useBilling } from '../src/providers/BillingProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { useSelectedDate } from '../src/providers/SelectedDateProvider';
import { colors, radius, spacing, typography } from '../src/theme';

interface Data {
  owner: string;
  plans: PlannedWorkoutRow[];
  foodDates: string[];
  mealPlan: { planned_on: string; logged_at: string | null }[];
  weights: { date: string; value: number }[];
}

const FEELS: { key: Feel; label: string }[] = [{ key: 'easy', label: 'Too easy' }, { key: 'right', label: 'About right' }, { key: 'hard', label: 'Too hard' }];

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={{ flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.heroRaised }}>
    <Text style={[typography.heading, { color: colors.onHero }]}>{value}</Text>
    <Text style={[typography.small, { color: colors.onHeroMuted, textAlign: 'center' }]}>{label}</Text>
  </View>;
}

export default function CheckIn() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const billing = useBilling();
  const { profile, targets, today } = useProfile();
  const { setSelectedDate } = useSelectedDate();
  const week = useMemo(() => reviewWeek(today), [today]);
  const coming = today >= week.next ? 'this week' : 'next week';
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feel, setFeel] = useState<Feel | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const nextEnd = addDays(week.next, 6);
      const [plans, food, meals, weights, finished] = await Promise.all([
        loadPlannedWorkouts(week.start, nextEnd),
        supabase.from('food_log_entries').select('logged_on').gte('logged_on', addDays(today, -20)).lte('logged_on', today),
        supabase.from('meal_plan_entries').select('planned_on, logged_at').gte('planned_on', week.start).lte('planned_on', week.end),
        loadMeasurements('weight'),
        checkinDone(userId, week.start),
      ]);
      if (food.error) throw new Error(food.error.message);
      if (meals.error) throw new Error(meals.error.message);
      setData({
        owner: userId, plans,
        foodDates: (food.data ?? []).map((row: { logged_on: string }) => row.logged_on),
        mealPlan: (meals.data ?? []) as Data['mealPlan'],
        weights: weights.map((row) => ({ date: row.measured_on, value: row.value })),
      });
      if (finished) setDone('You already checked in for this week.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your week.');
    }
  }, [userId, week.start, week.end, week.next, today]);
  useEffect(() => { setData(null); setDone(null); setFeel(null); void load(); }, [load]);

  const current = data && data.owner === userId ? data : null;
  const summary = current ? summarizeWeek({ start: week.start, end: week.end, planned: current.plans, foodLogDates: current.foodDates, mealPlan: current.mealPlan }) : null;
  const advice = summary ? trainingAdvice(summary, feel) : null;
  const meals = summary ? mealAdvice(summary) : null;
  const upcoming = current?.plans.filter((plan) => plan.planned_for >= week.next && plan.planned_for >= today && !plan.completed_workout_id) ?? [];
  const calories = profile && targets && current ? adaptiveTargetSuggestion({
    entries: current.foodDates.map((logged_on) => ({ logged_on })), weights: current.weights, today, goal: profile.goal, sex: profile.sex, targets,
  }) : null;

  async function finish() {
    if (!userId || !advice || busy) return;
    if (advice.mode !== 'hold' && upcoming.length && !billing.allowed) { router.push({ pathname: '/premium', params: { from: 'checkin' } }); return; }
    setBusy(true); setError(null);
    try {
      const changed = upcoming.length ? await applyCheckin(userId, week.start, upcoming, advice.mode) : 0;
      await markCheckinDone(userId, week.start, advice.mode);
      setDone(advice.mode === 'hold' || !upcoming.length ? `Checked in. ${coming[0].toUpperCase()}${coming.slice(1)} stays as planned.`
        : changed === upcoming.length ? `Updated ${changed} workout${changed === 1 ? '' : 's'} for ${coming}.`
          : `Updated ${changed} of ${upcoming.length} workouts. The rest changed since you opened this, so they were left alone.`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your workouts.');
    } finally { setBusy(false); }
  }
  async function skip() {
    if (!userId) return;
    await markCheckinDone(userId, week.start, 'skipped').catch(() => {});
    router.back();
  }

  return <Screen>
    <HeroCard>
      <Eyebrow onHero>Weekly check-in</Eyebrow>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.onHero, marginTop: spacing.xs }]}>{formatDay(week.start)} – {formatDay(week.end)}</Text>
      {summary ? <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <Stat value={summary.workoutsPlanned ? `${summary.workoutsDone}/${summary.workoutsPlanned}` : '–'} label="Workouts" />
        <Stat value={`${summary.foodDays}/7`} label="Days logged" />
        <Stat value={summary.mealsPlanned ? `${summary.mealsEaten}/${summary.mealsPlanned}` : '–'} label="Planned meals" />
      </View> : null}
    </HeroCard>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {!summary && !error ? <Loading /> : null}
    {done ? <Notice tone="info">{done}</Notice> : null}

    {summary ? <Card>
      <Eyebrow>Training</Eyebrow>
      {summary.workoutsPlanned ? <>
        <Text style={typography.subheading}>How did it feel?</Text>
        <ChipRow>{FEELS.map((item) => <Chip key={item.key} label={item.label} selected={feel === item.key} disabled={busy} onPress={() => setFeel(feel === item.key ? null : item.key)} />)}</ChipRow>
        {advice ? <>
          <Text style={[typography.heading, { marginTop: spacing.sm }]}>{advice.title}</Text>
          <Text style={typography.small}>{advice.reason}{advice.mode === 'ease' ? ` ${coming[0].toUpperCase()}${coming.slice(1)}: ~15% shorter runs and one less set.` : advice.mode === 'progress' ? ` ${coming[0].toUpperCase()}${coming.slice(1)}: ~10% longer runs and +1 rep.` : ''}</Text>
        </> : null}
        {upcoming.length ? <Text style={typography.small}>{upcoming.length} workout{upcoming.length === 1 ? '' : 's'} planned {coming}.</Text>
          : <Button title={`Plan training for ${coming}`} icon="barbell-outline" variant="ghost" onPress={() => router.push('/workout/plan')} />}
      </> : <>
        <Text style={typography.small}>No workouts were planned. A plan makes check-ins smarter.</Text>
        <Button title="Build a training plan" icon="barbell-outline" variant="secondary" onPress={() => router.push('/workout/plan')} />
      </>}
    </Card> : null}

    {summary ? <Card>
      <Eyebrow>Food</Eyebrow>
      {meals ? <Text style={typography.body}>{meals}</Text> : <Text style={typography.body}>Nice logging this week.</Text>}
      {calories?.status === 'suggestion' ? <>
        <Text style={typography.small}>{calories.reason}</Text>
        <Button title={`Review ${calories.changeKcal > 0 ? '+' : ''}${calories.changeKcal} kcal target change`} variant="secondary" onPress={() => router.push('/progress')} />
      </> : null}
      <Button title={`Plan meals for ${coming}`} icon="sparkles-outline" variant="secondary" onPress={() => { setSelectedDate(week.next); router.push({ pathname: '/(tabs)/plan', params: { generate: '1' } }); }} />
    </Card> : null}

    {summary && advice && !done ? <>
      <Button title={advice.mode === 'hold' || !upcoming.length ? 'Finish check-in' : billing.allowed ? `Apply to ${coming}` : 'Apply with Buko Plus'}
        icon={advice.mode !== 'hold' && upcoming.length && !billing.allowed ? 'lock-closed-outline' : 'checkmark'} loading={busy} onPress={() => { void finish(); }} />
      <Button title="Skip this week" variant="ghost" disabled={busy} onPress={() => { void skip(); }} />
    </> : null}
    {summary && !advice && !done ? <Button title="Done" variant="ghost" onPress={() => { void skip(); }} /> : null}
  </Screen>;
}
