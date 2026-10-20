import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { Button, Card, Empty, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { searchProducts } from '../../src/lib/api/openFoodFacts';
import { searchWholeFoods } from '../../src/lib/api/usda';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';
import type { Food, FoodLogEntry } from '../../src/types';

function FoodRow({ food, onPress }: { food: Food; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={typography.subheading} numberOfLines={2}>{food.name}</Text>
          <Text style={typography.small} numberOfLines={1}>
            {food.brand ? `${food.brand} · ` : ''}{Math.round(food.per100g.calories ?? 0)} kcal per 100 g
          </Text>
        </View>
        <Ionicons name="add-circle" size={26} color={colors.primary} />
      </Card>
    </Pressable>
  );
}

/** Rebuild a Food from a past diary entry so it can be logged again. */
function foodFromEntry(e: FoodLogEntry): Food {
  const k = 100 / e.grams;
  return {
    source: e.source, sourceId: e.source_id ?? e.name, name: e.name, brand: e.brand, imageUrl: null,
    per100g: { calories: e.calories * k, protein: e.protein_g * k, carbs: e.carbs_g * k, fat: e.fat_g * k, sugars: null, saturatedFat: null, sodiumMg: null, fiber: null },
    servingG: e.grams, servingLabel: null,
  };
}

export default function SearchFood() {
  const router = useRouter();
  const { meal, date } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [whole, setWhole] = useState<Food[]>([]);
  const [packaged, setPackaged] = useState<Food[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [recent, setRecent] = useState<Food[]>([]);

  useFocusEffect(
    useCallback(() => {
      supabase.from('food_log_entries').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => {
        const seen = new Set<string>();
        const foods: Food[] = [];
        for (const e of (data as FoodLogEntry[]) ?? []) {
          const key = `${e.source}:${e.source_id ?? e.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          foods.push(foodFromEntry(e));
          if (foods.length === 15) break;
        }
        setRecent(foods);
      });
    }, []),
  );

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setErrors([]);
    const [w, p] = await Promise.allSettled([searchWholeFoods(q), searchProducts(q)]);
    setWhole(w.status === 'fulfilled' ? w.value : []);
    setPackaged(p.status === 'fulfilled' ? p.value : []);
    setErrors([w, p].filter((r) => r.status === 'rejected').map((r) => String((r as PromiseRejectedResult).reason?.message ?? 'Search failed.')));
    setSearched(q);
    setLoading(false);
  }

  const pick = (food: Food) => router.push({ pathname: '/log/add', params: { food: JSON.stringify(food), meal, date } });

  return (
    <Screen edges={[]}>
      <Button title="Scan a barcode" icon="barcode-outline" variant="secondary" onPress={() => router.push({ pathname: '/log/scan', params: { meal, date } })} />
      <View style={{ height: spacing.md }} />
      <TextField placeholder="Search foods, e.g. banana or oat milk" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={search} autoCorrect={false} />

      {loading ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : null}
      {errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}

      {searched === null ? (
        <>
          <Heading>Recent foods</Heading>
          <View style={{ height: spacing.md }} />
          {recent.length === 0 ? <Empty icon="time-outline" text="Foods you log will show up here for quick re-adding." /> : null}
          {recent.map((f) => <FoodRow key={`${f.source}:${f.sourceId}`} food={f} onPress={() => pick(f)} />)}
        </>
      ) : (
        <>
          {whole.length ? <><Heading>Whole foods</Heading><View style={{ height: spacing.md }} /></> : null}
          {whole.map((f) => <FoodRow key={`u${f.sourceId}`} food={f} onPress={() => pick(f)} />)}
          {packaged.length ? <><View style={{ height: spacing.sm }} /><Heading>Packaged products</Heading><View style={{ height: spacing.md }} /></> : null}
          {packaged.map((f) => <FoodRow key={`o${f.sourceId}`} food={f} onPress={() => pick(f)} />)}
          {!loading && !whole.length && !packaged.length && !errors.length ? <Empty icon="search-outline" text={`No results for “${searched}”.`} /> : null}
        </>
      )}
      <Attribution usda />
    </Screen>
  );
}
