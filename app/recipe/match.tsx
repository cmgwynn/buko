import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { Body, Button, Card, Empty, Label, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { searchWholeFoods } from '../../src/lib/api/usda';
import { getDraft, updateDraft } from '../../src/lib/recipes/draft';
import { applyFood } from '../../src/lib/recipes/matching';
import { colors, spacing, typography } from '../../src/theme';
import type { Food } from '../../src/types';

export default function MatchIngredient() {
  const router = useRouter();
  const { index } = useLocalSearchParams<{ index: string }>();
  const i = Number(index);
  const ing = getDraft().ingredients[i];
  const [query, setQuery] = useState(ing?.name ?? '');
  const [results, setResults] = useState<Food[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grams, setGrams] = useState(ing?.grams ? String(Math.round(ing.grams)) : '');

  async function search() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchWholeFoods(query.trim(), 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    }
    setBusy(false);
  }

  useEffect(() => {
    if (ing?.match_status === 'unmatched') search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ing) return <Loading />;

  const setIng = (next: typeof ing) =>
    updateDraft((cur) => ({ ingredients: cur.ingredients.map((x, idx) => (idx === i ? next : x)) }));

  function choose(food: Food) {
    setIng(applyFood({ ...ing, grams: Number(grams) > 0 ? Number(grams) : ing.grams }, food));
    router.back();
  }

  function saveGrams() {
    const g = Number(grams);
    setIng({ ...ing, grams: g > 0 ? g : null });
    router.back();
  }

  return (
    <Screen edges={[]}>
      <Text style={typography.heading}>{ing.raw_text}</Text>
      <Body muted>Choose the food that best matches, and check the weight used for nutrition.</Body>
      <TextField label="Weight in this recipe (grams)" keyboardType="decimal-pad" value={grams} onChangeText={setGrams} placeholder="e.g. 250" />
      <Button title="Save weight" variant="secondary" onPress={saveGrams} />

      <Label>Search USDA foods</Label>
      <TextField value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" autoCapitalize="none" />
      <Button title="Search" onPress={search} loading={busy} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {results && results.length === 0 ? <Empty icon="search-outline" text="No matches. Try a simpler word, like “chicken breast”." /> : null}
      {results?.map((f) => (
        <Pressable key={f.sourceId} onPress={() => choose(f)}>
          <Card style={{ padding: spacing.md }}>
            <Text style={typography.body}>{f.name}</Text>
            <Text style={typography.small}>
              {Math.round(f.per100g.calories ?? 0)} kcal · P {Math.round(f.per100g.protein ?? 0)} · C {Math.round(f.per100g.carbs ?? 0)} · F {Math.round(f.per100g.fat ?? 0)} per 100 g
            </Text>
          </Card>
        </Pressable>
      ))}
      <Attribution usda />
    </Screen>
  );
}
