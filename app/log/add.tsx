import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { Body, Button, Card, Chip, ChipRow, Heading, Label, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { defaultMeal, MEALS, round1, toDateString } from '../../src/lib/diary';
import {
  amountToGrams, buildEntryInsert, completeMacrosForGrams, foodFromEntry, incompleteNutritionMessage, MAX_LOG_GRAMS,
  servingOptions, type AmountUnit,
} from '../../src/lib/foodLogging';
import { maybeWriteNutrition, removeNutritionFromHealth } from '../../src/lib/health';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';
import type { Food, FoodLogEntry, Meal } from '../../src/types';
import { useSelectedDate } from '../../src/providers/SelectedDateProvider';
import { isDateString } from '../../src/lib/dates';
import { EntryActionsSheet } from '../../src/components/diary/EntryActionsSheet';
import { DiaryTransferSheet, type TransferSelection } from '../../src/components/diary/DiaryTransferSheet';
import { invalidateDateHistory } from '../../src/components/date/dateHistory';

function parseFoodParam(raw: string | undefined): Food | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as Food;
    return f && typeof f.name === 'string' && f.per100g ? f : null;
  } catch {
    return null;
  }
}

/**
 * Choose an amount and meal for a food and save it to the diary.
 * With `entry`, edits an existing diary entry's amount/meal from its own nutrition snapshot.
 */
export default function AddEntry() {
  const router = useRouter();
  const confirm = useConfirm();
  const { session } = useAuth();
  const { selectedDate } = useSelectedDate();
  const params = useLocalSearchParams<{ food?: string; meal?: string; date?: string; entry?: string; amount?: string; unit?: string }>();
  const paramFood = useMemo(() => parseFoodParam(params.food), [params.food]);
  const editing = Boolean(params.entry);

  const [existing, setExisting] = useState<FoodLogEntry | null>(null);
  const [food, setFood] = useState<Food | null>(paramFood);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<AmountUnit>('g');
  const [amount, setAmount] = useState('');
  const [meal, setMeal] = useState<Meal>((MEALS.find((m) => m.key === params.meal)?.key ?? defaultMeal()) as Meal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState(false);
  const [transfer, setTransfer] = useState<TransferSelection | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (editing || !paramFood) return;
    const options = servingOptions(paramFood);
    const requested = options.find((o) => o.unit === params.unit);
    const initial = requested ?? options[0];
    setFood(paramFood);
    setUnit(initial.unit);
    const given = params.amount && Number(params.amount) > 0 ? params.amount : null;
    setAmount(given ?? (initial.unit === 'serving' ? '1' : '100'));
  }, [editing, paramFood, params.amount, params.unit]);

  useEffect(() => {
    if (!params.entry) return;
    let cancelled = false;
    supabase.from('food_log_entries').select('*').eq('id', params.entry).maybeSingle().then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) return setLoadError(e.message);
      if (!data) return setLoadError('This diary entry no longer exists.');
      const entry = data as FoodLogEntry;
      const rebuilt = foodFromEntry(entry);
      if (!rebuilt) return setLoadError('This entry has no valid weight, so its amount cannot be changed. Remove it and log it again.');
      setExisting(entry);
      setFood(rebuilt.food);
      setUnit(rebuilt.last.unit);
      setAmount(String(rebuilt.last.quantity));
      setMeal(entry.meal);
    });
    return () => { cancelled = true; };
  }, [params.entry]);

  if (loadError) {
    return (
      <Screen variant="form" edges={[]}>
        <Notice tone="danger">{loadError}</Notice>
        <Button title="Go back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!food) {
    if (editing) return <Loading />;
    return (
      <Screen variant="form" edges={[]}>
        <Notice tone="danger">This food could not be opened. Search for it again.</Notice>
        <Button title="Search foods" onPress={() => router.replace({ pathname: '/log/search', params: { meal: params.meal, date: params.date } })} />
      </Screen>
    );
  }

  const options = servingOptions(food);
  const incomplete = incompleteNutritionMessage(food.per100g);
  const grams = amountToGrams(amount, unit, food);
  const macros = grams === null ? null : completeMacrosForGrams(food.per100g, grams);
  const date = existing?.logged_on ?? params.date ?? selectedDate;

  function switchUnit(next: AmountUnit) {
    if (next === unit || !food) return;
    const opt = options.find((o) => o.unit === next)!;
    setUnit(next);
    setAmount(grams === null ? (next === 'serving' ? '1' : '100') : String(round1(grams / opt.grams)));
  }

  async function save() {
    if (!session || !food || saved) return;
    if (!isDateString(date) || date > toDateString(new Date())) return setError('Choose a valid past or current diary date. Use Plan for future meals.');
    const built = buildEntryInsert(food, { userId: session.user.id, date, meal, amount, unit });
    if ('error' in built) return setError(built.error);
    setBusy(true);
    setError(null);
    if (existing) {
      const { user_id: _u, logged_on: _d, source: _s, source_id: _i, name: _n, brand: _b, ...changes } = built.row;
      const { error: e } = await supabase.from('food_log_entries').update(changes).eq('id', existing.id);
      if (e) {
        setError(`Could not save your changes: ${e.message}`);
        setBusy(false);
        return;
      }
      setSaved(true);
      invalidateDateHistory();
      if (existing.health_external_id) {
        const removal = await removeNutritionFromHealth(existing.health_external_id);
        if (removal === 'failed') {
          setStatus('Changes saved in Buko. The old health sample could not be removed; its link is kept and no duplicate was written. Check your health app before exporting again.');
          setBusy(false); return;
        }
        const cleared = await supabase.from('food_log_entries').update({ health_external_id: null }).eq('id', existing.id);
        if (cleared.error) {
          setStatus(`Changes saved, but the old health link could not be cleared: ${cleared.error.message}`);
          setBusy(false); return;
        }
      }
      const healthStatus = await maybeWriteNutrition(existing.id);
      if (healthStatus === 'failed') { setStatus('Changes saved in Buko, but the health copy could not be updated. Check your health permissions and connection.'); setBusy(false); return; }
      router.back();
      return;
    }
    const { data: inserted, error: e } = await supabase.from('food_log_entries').insert(built.row).select('id').single();
    if (e) {
      setError(`Could not add this food: ${e.message}`);
      setBusy(false);
      return;
    }
    maybeWriteNutrition((inserted as { id: string }).id);
    invalidateDateHistory();
    router.navigate({ pathname: '/(tabs)', params: { date } });
  }

  async function remove() {
    if (!existing) return;
    const ok = await confirm({ title: 'Remove entry?', message: `${existing.name} will be removed from your diary.`, confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    setBusy(true);
    const { error: e } = await supabase.from('food_log_entries').delete().eq('id', existing.id);
    if (e) {
      setError(`Could not remove this entry: ${e.message}`);
      setBusy(false);
      return;
    }
    removeNutritionFromHealth(existing.health_external_id ?? null);
    invalidateDateHistory();
    router.back();
  }

  const manualParams = { meal, date, food: JSON.stringify(food), barcode: 'barcode' in food ? String((food as { barcode?: string }).barcode ?? '') : '' };

  return (
    <Screen variant="form" edges={[]}>
      <Stack.Screen options={{ title: editing ? 'Edit entry' : 'Log food' }} />
      <Heading>{food.name}</Heading>
      {existing ? <Button title="Favorite, move or copy food" variant="ghost" disabled={busy || saved} onPress={() => setActions(true)} /> : null}
      <EntryActionsSheet entry={actions ? existing : null} onClose={() => setActions(false)} onTransfer={(mode, entry) => { setActions(false); setTransfer({ mode, entry }); }} />
      <DiaryTransferSheet selection={transfer} onClose={() => setTransfer(null)} onSaved={(message) => {
        setStatus(message);
        if (existing) supabase.from('food_log_entries').select('*').eq('id', existing.id).single().then(({ data, error: refreshError }) => {
          if (refreshError) setError(`Action saved, but this entry could not be refreshed: ${refreshError.message}`);
          else { setExisting(data as FoodLogEntry); setMeal(data.meal as Meal); }
        });
      }} />
      {food.brand ? <Body muted>{food.brand}</Body> : null}
      <View style={{ height: spacing.lg }} />

      {incomplete ? (
        <>
          <Notice tone="danger">{incomplete}</Notice>
          <Button title="Enter nutrition manually" icon="create-outline" onPress={() => router.replace({ pathname: '/log/manual', params: manualParams })} />
          <Button title="Search for another food" variant="secondary" onPress={() => router.replace({ pathname: '/log/search', params: { meal, date } })} />
        </>
      ) : (
        <>
          {options.length > 1 ? (
            <>
              <Label>Measure in</Label>
              <ChipRow>
                {options.map((o) => <Chip key={o.unit} label={o.label} selected={unit === o.unit} onPress={() => switchUnit(o.unit)} />)}
              </ChipRow>
              <View style={{ height: spacing.lg }} />
            </>
          ) : null}

          <TextField
            label={unit === 'serving' ? 'Number of servings' : 'Amount (grams)'}
            value={amount}
            onChangeText={(t) => { setAmount(t); setError(null); }}
            keyboardType="decimal-pad"
            error={amount && grams === null ? `Enter an amount greater than 0 and up to ${MAX_LOG_GRAMS.toLocaleString()} g.` : null}
          />
          {options.length === 1 && !editing ? <Text style={[typography.small, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>This source doesn&apos;t give a serving weight, so amounts are in grams.</Text> : null}

          <Label>Meal</Label>
          <ChipRow>
            {MEALS.map((m) => <Chip key={m.key} label={m.label} selected={meal === m.key} onPress={() => setMeal(m.key)} />)}
          </ChipRow>
          <View style={{ height: spacing.lg }} />

          <Card>
            <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>{macros ? Math.round(macros.calories) : '–'} kcal</Text>
            {grams !== null ? <Text style={typography.small}>{round1(grams)} g</Text> : null}
            <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
              {([['Protein', macros?.protein_g], ['Carbs', macros?.carbs_g], ['Fat', macros?.fat_g]] as const).map(([l, v]) => (
                <View key={l} style={{ flex: 1 }}>
                  <Text style={typography.subheading}>{v === undefined ? '–' : `${Math.round(v)} g`}</Text>
                  <Text style={typography.small}>{l}</Text>
                </View>
              ))}
            </View>
          </Card>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {status ? <Notice tone="info">{status}</Notice> : null}
          <Button title={saved ? 'View diary' : editing ? 'Save changes' : 'Add to diary'} onPress={saved ? () => router.navigate({ pathname: '/(tabs)', params: { date } }) : save} loading={busy} disabled={!macros || busy} />
        </>
      )}
      {editing ? <Button title="Remove entry" variant="ghost" onPress={remove} disabled={busy || saved} /> : null}
    </Screen>
  );
}
