import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { RecipeImage } from '../../src/components/RecipeImage';
import { RecipeSourceNav } from '../../src/components/RecipeSourceNav';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { TabHeader } from '../../src/components/TabHeader';
import { Body, Button, Card, CardGrid, Chip, ChipRow, Empty, MotionPressable, Notice, Screen, TextField } from '../../src/components/ui';
import { getFavoriteRecipeIds, getRecentlyCookedRecipes, setRecipeFavorite } from '../../src/lib/recipes/activityClient';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import type { Recipe, RecipeIngredient } from '../../src/lib/recipes/types';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, spacing, typography } from '../../src/theme';

type Row = Recipe & { recipe_ingredients: Pick<RecipeIngredient, 'grams' | 'nutrition' | 'name' | 'raw_text'>[] };
type Sort = 'newest' | 'recent' | 'time' | 'protein' | 'score';

const sortLabels: Record<Sort, string> = {
  newest: 'Newest',
  recent: 'Recently cooked',
  time: 'Quickest',
  protein: 'Protein',
  score: 'Score',
};

export default function Recipes() {
  const router = useRouter();
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [activityBusy, setActivityBusy] = useState<string | null>(null);
  const [activityReady, setActivityReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoaded(false);
      setActivityReady(false);
      Promise.all([
        supabase.from('recipes').select('*, recipe_ingredients(grams, nutrition, name, raw_text)').order('created_at', { ascending: false }),
        session ? getFavoriteRecipeIds(session.user.id).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load favorites.'); return null; }) : Promise.resolve([]),
        session ? getRecentlyCookedRecipes(session.user.id).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load cooking history.'); return null; }) : Promise.resolve([]),
      ]).then(([recipeResult, favoriteResult, recentResult]) => {
        if (!active) return;
        if (recipeResult.error) throw new Error(recipeResult.error.message);
        setRows(recipeResult.data as Row[]);
        setFavoriteIds(favoriteResult ?? []);
        setRecentIds(recentResult?.map((entry) => entry.recipeId) ?? []);
        if (favoriteResult !== null && recentResult !== null) {
          setError(null);
          setActivityReady(true);
        }
      }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Could not load recipes or saved recipe activity.'); })
        .finally(() => { if (active) setLoaded(true); });
      return () => { active = false; };
    }, [session?.user.id]),
  );

  function create() {
    router.push('/recipe/edit');
  }

  async function toggleFavorite(recipeId: string) {
    if (!session || activityBusy || !activityReady) return;
    setActivityBusy(recipeId);
    try {
      setFavoriteIds(await setRecipeFavorite(session.user.id, recipeId, !favoriteIds.includes(recipeId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update favorites.');
    } finally {
      setActivityBusy(null);
    }
  }

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter((recipe) => {
      if (favoritesOnly && !favoriteIds.includes(recipe.id)) return false;
      if (!query) return true;
      return recipe.title.toLocaleLowerCase().includes(query) ||
        recipe.recipe_ingredients.some((ingredient) => ingredient.name?.toLocaleLowerCase().includes(query) || ingredient.raw_text?.toLocaleLowerCase().includes(query));
    }).sort((a, b) => {
      if (sort === 'recent') {
        const aRecent = recentIds.indexOf(a.id);
        const bRecent = recentIds.indexOf(b.id);
        return (aRecent < 0 ? Number.MAX_SAFE_INTEGER : aRecent) - (bRecent < 0 ? Number.MAX_SAFE_INTEGER : bRecent);
      }
      if (sort === 'time') return ((a.prep_minutes ?? 0) + (a.cook_minutes ?? 0)) - ((b.prep_minutes ?? 0) + (b.cook_minutes ?? 0));
      if (sort === 'protein') return nutritionFor(b).perServing.protein_g - nutritionFor(a).perServing.protein_g;
      if (sort === 'score') return (scoreFor(b) ?? -1) - (scoreFor(a) ?? -1);
      return Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? '');
    });
  }, [rows, search, favoritesOnly, favoriteIds, recentIds, sort]);

  function nutritionFor(row: Row) {
    return computeRecipeNutrition(row.recipe_ingredients, row.servings);
  }

  function scoreFor(row: Row) {
    const nutrition = nutritionFor(row);
    return nutrition.scoreEligible ? scoreRecipe(row.title, nutrition).score : -1;
  }

  return (
    <Screen>
      <TabHeader title="Recipes" />
      <RecipeSourceNav active="saved" />
      <TextField label="Search saved recipes" placeholder="Recipe or ingredient" value={search} onChangeText={setSearch} autoCorrect={false} />
      <ChipRow>
        <Chip label={favoritesOnly ? 'Favorites ✓' : 'Favorites'} selected={favoritesOnly} onPress={() => setFavoritesOnly((value) => !value)} />
        {Object.entries(sortLabels).map(([key, label]) => (
          <Chip key={key} label={label} selected={sort === key} onPress={() => setSort(key as Sort)} />
        ))}
      </ChipRow>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="Create recipe" icon="add" onPress={create} /></View>
        <View style={{ flex: 1 }}><Button title="Import" icon="link" variant="secondary" onPress={() => router.push('/recipe/import')} /></View>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loaded && visibleRows.length === 0 && !error
        ? <Empty icon="restaurant-outline" text={rows.length ? 'No saved recipes match these filters.' : 'No recipes yet. Create one or import it from a link.'} />
        : null}
      <Body muted>{loaded ? `${visibleRows.length} saved recipe${visibleRows.length === 1 ? '' : 's'}` : 'Loading saved recipes…'}</Body>
      <CardGrid>{visibleRows.map((recipe) => {
        const nutrition = nutritionFor(recipe);
        const result = nutrition.scoreEligible ? scoreRecipe(recipe.title, nutrition) : null;
        const isFavorite = favoriteIds.includes(recipe.id);
        const totalMinutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
        return (
          <View key={recipe.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={`Open recipe: ${recipe.title}`}
              onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } })}
              style={{ flex: 1 }}
            >
              <Card style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginBottom: spacing.sm }}>
                <RecipeImage path={recipe.photo_path} style={{ width: 56, height: 56, marginRight: spacing.md }} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.subheading} numberOfLines={2}>{recipe.title}</Text>
                  <Text style={typography.small}>
                    {nutrition.complete
                      ? `${Math.round(nutrition.perServing.calories)} kcal · ${Math.round(nutrition.perServing.protein_g)} g protein`
                      : 'Partial nutrition estimate'}
                    {totalMinutes ? ` · ${totalMinutes} min` : ''}
                  </Text>
                </View>
                {result ? <ScoreBadge score={result.score} rating={result.rating} size={44} /> : <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
              </Card>
            </MotionPressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? `Remove ${recipe.title} from favorites` : `Add ${recipe.title} to favorites`}
              accessibilityState={{ selected: isFavorite, busy: activityBusy === recipe.id }}
              aria-selected={isFavorite} aria-busy={activityBusy === recipe.id}
              disabled={activityBusy !== null || !activityReady}
              onPress={() => void toggleFavorite(recipe.id)}
              hitSlop={8}
              style={{ padding: spacing.sm }}
            >
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? colors.danger : colors.textMuted} />
            </Pressable>
          </View>
        );
      })}</CardGrid>
    </Screen>
  );
}
