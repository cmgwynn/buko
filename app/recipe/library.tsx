import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, CardGrid, Chip, ChipRow, Heading, Screen, TextField } from '../../src/components/ui';
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
  const [about, setAbout] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const recipes = useMemo(() => filterLibraryRecipes({ meal, cuisine, search }), [meal, cuisine, search]);
  function reset() {
    setMeal(null); setCuisine(null); setSearch(''); setExpanded(null); setVisibleCount(12);
  }
  return (
    <Screen>
      <RecipeSourceNav active="library" />
      <Heading>Find a recipe</Heading>
      <Body muted>{STARTER_RECIPES.length} original Buko recipes. Estimated scores are not personal suitability advice.</Body>
      <TextField label="Search recipes or ingredients" placeholder="Try chicken, lentils or tofu" value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(12); setExpanded(null); }} autoCorrect={false} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <Body>{recipes.length} found</Body>
        <Button title={`Filters${meal || cuisine ? ' (1+)' : ''}`} variant="secondary" onPress={() => setShowFilters(true)} />
      </View>
      {meal || cuisine ? <ChipRow>
        {meal ? <Chip label={`${meal} ×`} selected onPress={() => { setMeal(null); setVisibleCount(12); setExpanded(null); }} /> : null}
        {cuisine ? <Chip label={`${cuisine} ×`} selected onPress={() => { setCuisine(null); setVisibleCount(12); setExpanded(null); }} /> : null}
        <Chip label="Clear" onPress={reset} />
      </ChipRow> : null}
      <Button title={about ? 'Hide score & preparation notes' : 'About scores & preparation'} variant="ghost" onPress={() => setAbout(!about)} />
      {about ? <Card>
        <Body>Scores are out of 100; Excellent starts at 75. Every unmodified library recipe meets that threshold under Buko&apos;s unchanged scoring model. Scores do not rank cultures or guarantee personal dietary suitability.</Body>
        <Body muted>Nutrition is estimated from input weights and generic USDA foods, not measured cooked yield or lab testing. Brands and edits can change results. Processing level and additives are unknown and excluded. Cooked grain and bean ingredients require advance preparation; times exclude advance cooking and chilling.</Body>
        <Body muted>Recipes are original Buko formulations, not copied from the references or endorsed by their authors. Cuisine links explain dish identities and techniques; ingredient links provide nutrition. Adaptation notes identify important changes. These recipes have not been kitchen-tested or reviewed by representatives of every cuisine.</Body>
      </Card> : null}
      {!recipes.length ? <Card><Heading>No recipes match</Heading><Body>Try another cuisine, meal type or ingredient, or clear the filters.</Body></Card> : null}
      <CardGrid>
        {recipes.slice(0, visibleCount).map((recipe) => {
          const { nutrition, result } = libraryRecipeSummary(recipe);
          return (
            <Card key={recipe.id}>
            <Text style={typography.label}>{recipe.cuisine} · {recipe.meal} · {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</Text>
            <Heading>{recipe.title}</Heading>
            <Body muted>{recipe.description}</Body>
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginVertical: spacing.md }}>
              <ScoreBadge score={result.score} rating={result.rating} size={60} />
              <View style={{ flex: 1 }}>
                <Body>{result.ratingLabel} · estimated score</Body>
                <Body muted>{Math.round(nutrition.perServing.calories)} kcal · {Math.round(nutrition.perServing.protein_g)} g protein per serving</Body>
              </View>
            </View>
            <Button title={expanded === recipe.id ? 'Hide ingredients and steps' : 'Preview ingredients and steps'} variant="ghost" onPress={() => setExpanded(expanded === recipe.id ? null : recipe.id)} />
            {expanded === recipe.id ? (
              <View style={{ marginBottom: spacing.md }}>
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
            <Button title="Save a copy" onPress={() => {
              setDraft(starterRecipeDraft(recipe));
              router.push('/recipe/edit');
            }} />
            </Card>
          );
        })}
      </CardGrid>
      {visibleCount < recipes.length ? <Button title={`Show more recipes (${recipes.length - visibleCount} remaining)`} variant="secondary" onPress={() => setVisibleCount((count) => count + 12)} /> : null}
      <Body muted>Keep perishable foods refrigerated. Cool cooked rice and grains promptly and refrigerate; reheat until steaming hot. Use separate utensils for raw meat and check the cooking temperatures in each recipe.</Body>
      <Body muted>Save a copy opens a private, editable recipe. It is added to My recipes only when you save it.</Body>
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
