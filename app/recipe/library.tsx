import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Card, CardGrid, Chip, ChipRow, Disclosure, Heading, Screen, TextField } from '../../src/components/ui';
import { RecipeSourceNav } from '../../src/components/RecipeSourceNav';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { setDraft } from '../../src/lib/recipes/draft';
import { filterLibraryRecipes, libraryIngredientText, libraryRecipeSummary, RECIPE_CUISINES, RECIPE_MEAL_TYPES, STARTER_RECIPES, starterRecipeDraft, type RecipeCuisine, type RecipeMealType } from '../../src/lib/recipes/library';
import { LIBRARY_FOODS } from '../../src/lib/recipes/libraryFoods';
import { CUISINE_REFERENCES } from '../../src/lib/recipes/libraryReferences';
import { colors, radius, spacing, typography } from '../../src/theme';

export default function RecipeLibrary() {
  const router = useRouter();
  const [meal, setMeal] = useState<RecipeMealType | null>(null);
  const [cuisine, setCuisine] = useState<RecipeCuisine | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const filterCount = (meal ? 1 : 0) + (cuisine ? 1 : 0);
  const recipes = useMemo(() => filterLibraryRecipes({ meal, cuisine, search }), [meal, cuisine, search]);
  function reset() {
    setMeal(null); setCuisine(null); setSearch(''); setExpanded(null); setVisibleCount(12);
  }
  return (
    <Screen>
      <RecipeSourceNav active="library" />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField placeholder="Search chicken, lentils, tofu…" accessibilityLabel="Search recipes or ingredients" value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(12); setExpanded(null); }} autoCorrect={false} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Filters${filterCount ? ` (${filterCount} on)` : ''}`} onPress={() => setShowFilters(true)}
          style={{ width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: filterCount ? colors.hero : colors.primarySoft }}>
          <Ionicons name="options-outline" size={22} color={filterCount ? colors.onHero : colors.primary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.sm }}>
        <Text style={typography.label}>{recipes.length} of {STARTER_RECIPES.length} recipes</Text>
        {meal ? <Chip label={`${meal} ×`} selected onPress={() => { setMeal(null); setVisibleCount(12); setExpanded(null); }} /> : null}
        {cuisine ? <Chip label={`${cuisine} ×`} selected onPress={() => { setCuisine(null); setVisibleCount(12); setExpanded(null); }} /> : null}
      </View>
      <Disclosure title="About scores & food safety">
        <Body>Scores are out of 100; Excellent starts at 75. Every unmodified library recipe meets that threshold under Buko&apos;s unchanged scoring model. Scores do not rank cultures or guarantee personal dietary suitability.</Body>
        <Body muted>Nutrition is estimated from input weights and generic USDA foods, not measured cooked yield or lab testing. Brands and edits can change results. Processing level and additives are unknown and excluded. Cooked grains and beans need advance preparation; times exclude advance cooking and chilling.</Body>
        <Body muted>Recipes are original Buko formulations, not copied from references or endorsed by their authors. Cuisine links explain dish identities and techniques; ingredient links provide nutrition. Adaptation notes identify important changes. Recipes are not kitchen-tested or reviewed by representatives of every cuisine.</Body>
        <Body muted>Refrigerate perishables. Cool cooked rice and grains promptly; reheat until steaming hot. Use separate utensils for raw meat and follow each recipe&apos;s cooking temperatures.</Body>
      </Disclosure>
      {!recipes.length ? <Card><Heading>No recipes match</Heading><Body>Try another cuisine, meal type or ingredient, or clear the filters.</Body></Card> : null}
      <CardGrid>
        {recipes.slice(0, visibleCount).map((recipe) => {
          const { nutrition, result } = libraryRecipeSummary(recipe);
          return (
            <Card key={recipe.id}>
            <Text style={typography.label}>{recipe.cuisine} · {recipe.meal} · {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Heading>{recipe.title}</Heading>
                <Text style={typography.small} numberOfLines={2}>{recipe.description}</Text>
                <Text style={[typography.small, { marginTop: spacing.xs, fontWeight: '600' }]}>{Math.round(nutrition.perServing.calories)} kcal · {Math.round(nutrition.perServing.protein_g)} g protein</Text>
              </View>
              <ScoreBadge score={result.score} rating={result.rating} size={52} />
            </View>
            {expanded === recipe.id ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={typography.subheading}>Recipe context</Text>
                {recipe.adaptation ? <Body>{recipe.adaptation}</Body> : null}
                <Body muted>{CUISINE_REFERENCES[recipe.cuisine].context}</Body>
                {CUISINE_REFERENCES[recipe.cuisine].links.map((source) => <Link key={source.url} href={source.url} target="_blank" style={{ marginVertical: spacing.xs }}>Cooking reference: {source.title}</Link>)}
                <Text style={typography.subheading}>Ingredients</Text>
                {recipe.ingredients.map((ingredient, index) => <View key={`${ingredient.food}-${index}`} style={{ marginBottom: spacing.sm }}>
                  <Text style={typography.body}>{'\u2022'} {libraryIngredientText(ingredient)}</Text>
                  <Link href={`https://fdc.nal.usda.gov/food-details/${LIBRARY_FOODS[ingredient.food].fdcId}/nutrients`} target="_blank">USDA source: {LIBRARY_FOODS[ingredient.food].description}</Link>
                </View>)}
                <Text style={[typography.subheading, { marginTop: spacing.md }]}>Steps</Text>
                {recipe.steps.map((text, index) => <Text key={text} style={[typography.body, { marginBottom: spacing.sm }]}>{index + 1}. {text}</Text>)}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}><Button title={expanded === recipe.id ? 'Hide' : 'Details'} icon={expanded === recipe.id ? 'chevron-up' : 'chevron-down'} variant="secondary"
                onPress={() => setExpanded(expanded === recipe.id ? null : recipe.id)} /></View>
              <View style={{ flex: 1 }}><Button title="Save copy" icon="bookmark-outline" onPress={() => {
                setDraft(starterRecipeDraft(recipe));
                router.push('/recipe/edit');
              }} /></View>
            </View>
            </Card>
          );
        })}
      </CardGrid>
      {visibleCount < recipes.length ? <Button title={`Show more recipes (${recipes.length - visibleCount} remaining)`} variant="secondary" onPress={() => setVisibleCount((count) => count + 12)} /> : null}
      <Modal transparent visible={showFilters} animationType="slide" onRequestClose={() => setShowFilters(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable accessibilityLabel="Close filters" onPress={() => setShowFilters(false)} style={{ flex: 1 }} />
          <View style={{ maxHeight: '78%', backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Heading>Filter recipes</Heading>
              <Text style={[typography.subheading, { marginTop: spacing.md }]}>Meal</Text>
              <ChipRow>
                <Chip label="All meals" selected={!meal} onPress={() => { setMeal(null); setVisibleCount(12); }} />
                {RECIPE_MEAL_TYPES.map((type) => <Chip key={type} label={type} selected={meal === type} onPress={() => { setMeal(type); setVisibleCount(12); }} />)}
              </ChipRow>
              <Text style={[typography.subheading, { marginTop: spacing.md }]}>Cuisine</Text>
              <ChipRow>
                <Chip label="All cuisines" selected={!cuisine} onPress={() => { setCuisine(null); setVisibleCount(12); }} />
                {RECIPE_CUISINES.map((type) => <Chip key={type} label={type} selected={cuisine === type} onPress={() => { setCuisine(type); setVisibleCount(12); }} />)}
              </ChipRow>
              <View style={{ height: spacing.md }} />
              <Button title="Show recipes" onPress={() => setShowFilters(false)} />
              <Button title="Clear filters" variant="ghost" onPress={reset} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
