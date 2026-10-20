import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Heading, Label, Notice, Screen, TextField } from '../../src/components/ui';
import { defaultGrams, defaultMeal, MEALS, macrosForGrams, round1, toDateString } from '../../src/lib/diary';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';
import type { Food, Meal } from '../../src/types';

type Unit = 'g' | 'serving';

/** Choose an amount and meal for a food, then save it to the diary. */
export default function AddEntry() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ food: string; meal?: string; date?: string }>();
  const food = useMemo(() => JSON.parse(params.food) as Food, [params.food]);

  const hasServing = food.servingG !== null;
  const [unit, setUnit] = useState<Unit>(hasServing ? 'serving' : 'g');
  const [amount, setAmount] = useState(hasServing ? '1' : String(defaultGrams(food)));
  const [meal, setMeal] = useState<Meal>((MEALS.find((m) => m.key === params.meal)?.key ?? defaultMeal()) as Meal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = parseFloat(amount);
  const grams = unit === 'serving' ? qty * (food.servingG ?? 100) : qty;
  const valid = Number.isFinite(grams) && grams > 0 && grams <= 5000;
  const macros = valid ? macrosForGrams(food.per100g, grams) : null;

  async function save() {
    if (!macros || !session) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.from('food_log_entries').insert({
      user_id: session.user.id,
      logged_on: params.date ?? toDateString(new Date()),
      meal, source: food.source, source_id: food.sourceId, name: food.name, brand: food.brand,
      quantity: qty, unit: unit === 'serving' ? 'serving' : 'g', grams: round1(grams),
      calories: round1(macros.calories), protein_g: round1(macros.protein_g), carbs_g: round1(macros.carbs_g), fat_g: round1(macros.fat_g),
    });
    if (e) {
      setError(e.message);
      setBusy(false);
    } else {
      router.navigate('/(tabs)');
    }
  }

  return (
    <Screen edges={[]}>
      <Heading>{food.name}</Heading>
      {food.brand ? <Body muted>{food.brand}</Body> : null}
      <View style={{ height: spacing.lg }} />

      {hasServing ? (
        <>
          <Label>Measure in</Label>
          <ChipRow>
            <Chip label={`Servings${food.servingLabel ? ` (${food.servingLabel})` : ` (${Math.round(food.servingG!)} g)`}`} selected={unit === 'serving'} onPress={() => { setUnit('serving'); setAmount('1'); }} />
            <Chip label="Grams" selected={unit === 'g'} onPress={() => { setUnit('g'); setAmount(String(Math.round(grams) || 100)); }} />
          </ChipRow>
          <View style={{ height: spacing.lg }} />
        </>
      ) : null}

      <TextField label={unit === 'serving' ? 'Number of servings' : 'Amount (grams)'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={amount && !valid ? 'Enter an amount greater than 0.' : null} />

      <Label>Meal</Label>
      <ChipRow>
        {MEALS.map((m) => <Chip key={m.key} label={m.label} selected={meal === m.key} onPress={() => setMeal(m.key)} />)}
      </ChipRow>
      <View style={{ height: spacing.lg }} />

      <Card>
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>{macros ? Math.round(macros.calories) : '–'} kcal</Text>
        <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
          {([['Protein', macros?.protein_g], ['Carbs', macros?.carbs_g], ['Fat', macros?.fat_g]] as const).map(([l, v]) => (
            <View key={l} style={{ flex: 1 }}>
              <Text style={typography.subheading}>{v === undefined ? '–' : `${Math.round(v)} g`}</Text>
              <Text style={typography.small}>{l}</Text>
            </View>
          ))}
        </View>
      </Card>
      {food.per100g.calories === null ? <Notice>This food has no calorie data, so it will be logged as 0 kcal.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button title="Add to diary" onPress={save} loading={busy} disabled={!valid} />
    </Screen>
  );
}
