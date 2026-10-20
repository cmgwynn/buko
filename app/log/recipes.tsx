import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeImage } from '../../src/components/RecipeImage';
import { Body, Card, Empty, Notice, Screen } from '../../src/components/ui';
import { computeRecipeNutrition } from '../../src/lib/recipes/nutrition';
import type { RecipeWithNutrition } from '../../src/lib/recipes/logging';
import { supabase } from '../../src/lib/supabase';
import { spacing, typography } from '../../src/theme';

/** Pick a saved recipe to log to the diary. */
export default function LogRecipe() {
  const router = useRouter();
  const { meal, date } = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [recipes, setRecipes] = useState<RecipeWithNutrition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition)').order('title').then(({ data, error: e }) => {
        if (e) setError(e.message);
        else setRecipes(data as RecipeWithNutrition[]);
      });
    }, []),
  );

  return (
    <Screen edges={[]}>
      <Body muted>Choose a recipe, then pick how many servings you ate.</Body>
      <View style={{ height: spacing.md }} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {recipes.length === 0 && !error ? <Empty icon="book-outline" text="No recipes yet. Add some in the Recipes tab." /> : null}
      {recipes.map((r) => {
        const n = computeRecipeNutrition(r.recipe_ingredients, r.servings);
        return (
          <Pressable key={r.id} onPress={() => router.push({ pathname: '/cook/finish', params: { id: r.id, direct: '1', meal, date } })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RecipeImage path={r.photo_path} style={{ width: 56, height: 56 }} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={typography.subheading} numberOfLines={1}>{r.title}</Text>
                <Text style={typography.small}>{n.counted > 0 ? `${Math.round(n.perServing.calories)} kcal per serving` : 'No nutrition yet'}</Text>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
