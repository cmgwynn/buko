import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeImage } from '../../src/components/RecipeImage';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { TabHeader } from '../../src/components/TabHeader';
import { Button, Card, Empty, Notice, Screen } from '../../src/components/ui';
import { setDraft, emptyDraft } from '../../src/lib/recipes/draft';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import type { Recipe, RecipeIngredient } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, typography } from '../../src/theme';

type Row = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition'>[] };

export default function Recipes() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('recipes')
        .select('*, recipe_ingredients(grams, nutrition)')
        .order('created_at', { ascending: false })
        .then(({ data, error: e }) => {
          if (e) setError(e.message);
          else {
            setError(null);
            setRows(data as Row[]);
          }
          setLoaded(true);
        });
    }, []),
  );

  function create() {
    setDraft(emptyDraft());
    router.push('/recipe/edit');
  }

  return (
    <Screen>
      <TabHeader title="Recipes" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="New recipe" icon="add" onPress={create} /></View>
        <View style={{ flex: 1 }}><Button title="Import link" icon="link" variant="secondary" onPress={() => router.push('/recipe/import')} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loaded && rows.length === 0 && !error ? <Empty icon="restaurant-outline" text="No recipes yet. Create one or import it from a link." /> : null}
      <View style={{ height: spacing.md }} />
      {rows.map((r) => {
        const nut = computeRecipeNutrition(r.recipe_ingredients, r.servings);
        const score = nut.counted > 0 ? scoreRecipe(r.title, nut) : null;
        return (
          <Pressable key={r.id} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: r.id } })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}>
              <RecipeImage path={r.photo_path} style={{ width: 64, height: 64, marginRight: spacing.md }} />
              <View style={{ flex: 1 }}>
                <Text style={typography.subheading} numberOfLines={2}>{r.title}</Text>
                <Text style={typography.small}>
                  {nut.counted > 0 ? `${Math.round(nut.perServing.calories)} kcal/serving · ` : ''}
                  {r.servings} serving{r.servings === 1 ? '' : 's'}
                  {r.prep_minutes || r.cook_minutes ? ` · ${(r.prep_minutes ?? 0) + (r.cook_minutes ?? 0)} min` : ''}
                </Text>
              </View>
              {score ? <ScoreBadge score={score.score} rating={score.rating} size={46} /> : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
