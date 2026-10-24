import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, CardGrid, Chip, ChipRow, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { setDraft } from '../../src/lib/recipes/draft';
import { filterLibraryRecipes, libraryIngredientText, libraryRecipeSummary, RECIPE_CUISINES, RECIPE_MEAL_TYPES, STARTER_RECIPES, starterRecipeDraft, type RecipeCuisine, type RecipeMealType } from '../../src/lib/recipes/library';
import { LIBRARY_FOODS } from '../../src/lib/recipes/libraryFoods';
import { spacing, typography } from '../../src/theme';

export default function RecipeLibrary() {
  const router = useRouter();
  const [meal, setMeal] = useState<RecipeMealType | null>(null);
  const [cuisine, setCuisine] = useState<RecipeCuisine | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(12);
  const [about, setAbout] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const recipes = useMemo(() => filterLibraryRecipes({ meal, cuisine, search }), [meal, cuisine, search]);
  function reset() {
    setMeal(null); setCuisine(null); setSearch(''); setExpanded(null); setVisibleCount(12);
  }
  return (
    <Screen>
      <Heading>Simple ideas for every meal</Heading>
      <Body muted>{STARTER_RECIPES.length} original, cuisine-inspired recipes to make your own. Every library original scores at least 75/100 (Excellent) using Buko&apos;s recipe scoring. Review ingredients for allergies and preferences; green does not mean suitable for every diet.</Body>
      <View style={{ height: spacing.lg }} />
      <TextField label="Search recipes or ingredients" placeholder="Try chicken, lentils or tofu" value={search} onChangeText={(value) => { setSearch(value); setVisibleCount(12); setExpanded(null); }} autoCorrect={false} />
      <Text style={typography.subheading}>Meal type</Text>
      <ChipRow>
        <Chip label="All meals" selected={!meal} onPress={() => { setMeal(null); setVisibleCount(12); setExpanded(null); }} />
        {RECIPE_MEAL_TYPES.map((type) => <Chip key={type} label={type} selected={meal === type} onPress={() => { setMeal(type); setVisibleCount(12); setExpanded(null); }} />)}
      </ChipRow>
      <Text style={[typography.subheading, { marginTop: spacing.md }]}>Cuisine inspiration</Text>
      <ChipRow>
        <Chip label="All cuisines" selected={!cuisine} onPress={() => { setCuisine(null); setVisibleCount(12); setExpanded(null); }} />
        {RECIPE_CUISINES.map((type) => <Chip key={type} label={type} selected={cuisine === type} onPress={() => { setCuisine(type); setVisibleCount(12); setExpanded(null); }} />)}
      </ChipRow>
      <View style={{ height: spacing.lg }} />
      <Body>{recipes.length} recipe{recipes.length === 1 ? '' : 's'} found{meal ? ` · ${meal}` : ''}{cuisine ? ` · ${cuisine}-inspired` : ''}</Body>
      {meal || cuisine || search ? <Button title="Clear filters" variant="ghost" onPress={reset} /> : null}
      <Button title={about ? 'Hide score & preparation notes' : 'About scores & preparation'} variant="ghost" onPress={() => setAbout(!about)} />
      {about ? <Notice tone="info">Scores and nutrition are estimates from listed ingredient weights and generic USDA foods, not lab-tested or medically certified. Cooking yield and brands can change results. Recipes use the general-food scoring model; processing level and additives are unknown and excluded. Editing a copy recalculates its score. Grain and bean weights marked cooked require advance cooking; times exclude advance preparation and chilling.</Notice> : null}
      {!recipes.length ? <Card><Heading>No recipes match</Heading><Body>Try another cuisine, meal type or ingredient, or clear the filters.</Body></Card> : null}
      <CardGrid>
        {recipes.slice(0, visibleCount).map((recipe) => {
          const { nutrition, result } = libraryRecipeSummary(recipe);
          return (
            <Card key={recipe.id}>
            <Text style={typography.label}>{recipe.cuisine}-inspired · {recipe.meal} · {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</Text>
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
                <Text style={typography.subheading}>Ingredients</Text>
                {recipe.ingredients.map((ingredient, index) => <View key={`${ingredient.food}-${index}`} style={{ marginBottom: spacing.sm }}>
                  <Text style={typography.body}>{'\u2022'} {libraryIngredientText(ingredient)}</Text>
                  <Link href={`https://fdc.nal.usda.gov/food-details/${LIBRARY_FOODS[ingredient.food].fdcId}/nutrients`} target="_blank">USDA source: {LIBRARY_FOODS[ingredient.food].description}</Link>
                </View>)}
                <Text style={[typography.subheading, { marginTop: spacing.md }]}>Steps</Text>
                {recipe.steps.map((text, index) => <Text key={text} style={[typography.body, { marginBottom: spacing.sm }]}>{index + 1}. {text}</Text>)}
              </View>
            ) : null}
            <Button title={`Use ${recipe.title}`} onPress={() => {
              setDraft(starterRecipeDraft(recipe));
              router.push('/recipe/edit');
            }} />
            </Card>
          );
        })}
      </CardGrid>
      {visibleCount < recipes.length ? <Button title={`Show more recipes (${recipes.length - visibleCount} remaining)`} variant="secondary" onPress={() => setVisibleCount((count) => count + 12)} /> : null}
      <Body muted>Keep perishable foods refrigerated. Cool cooked rice and grains promptly and refrigerate; reheat until steaming hot. Use separate utensils for raw meat and check the cooking temperatures in each recipe.</Body>
      <Body muted>Use opens a private editable draft. Nothing is added to your recipe book until you tap Save recipe.</Body>
    </Screen>
  );
}
