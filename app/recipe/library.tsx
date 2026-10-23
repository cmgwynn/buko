import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Card, CardGrid, Chip, ChipRow, Heading, Screen } from '../../src/components/ui';
import { setDraft } from '../../src/lib/recipes/draft';
import { RECIPE_MEAL_TYPES, STARTER_RECIPES, starterRecipeDraft, type RecipeMealType } from '../../src/lib/recipes/library';
import { spacing, typography } from '../../src/theme';

export default function RecipeLibrary() {
  const router = useRouter();
  const [meal, setMeal] = useState<RecipeMealType | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Screen>
      <Heading>Simple ideas for every meal</Heading>
      <Body muted>Original Buko recipes to make your own. Review ingredients for allergies and preferences. Nutrition is estimated after food matching, not pre-certified.</Body>
      <View style={{ height: spacing.lg }} />
      <ChipRow>
        <Chip label="All meals" selected={!meal} onPress={() => setMeal(null)} />
        {RECIPE_MEAL_TYPES.map((type) => <Chip key={type} label={type} selected={meal === type} onPress={() => setMeal(type)} />)}
      </ChipRow>
      <View style={{ height: spacing.lg }} />
      <CardGrid>
        {STARTER_RECIPES.filter((recipe) => !meal || recipe.meal === meal).map((recipe) => (
          <Card key={recipe.id}>
            <Text style={typography.label}>{recipe.meal} · {recipe.prepMinutes + recipe.cookMinutes} min · {recipe.servings} serving{recipe.servings === 1 ? '' : 's'}</Text>
            <Heading>{recipe.title}</Heading>
            <Body muted>{recipe.description}</Body>
            <Button title={expanded === recipe.id ? 'Hide ingredients and steps' : 'Preview ingredients and steps'} variant="ghost" onPress={() => setExpanded(expanded === recipe.id ? null : recipe.id)} />
            {expanded === recipe.id ? (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={typography.subheading}>Ingredients</Text>
                {recipe.ingredients.map((text) => <Text key={text} style={typography.body}>{'\u2022'} {text}</Text>)}
                <Text style={[typography.subheading, { marginTop: spacing.md }]}>Steps</Text>
                {recipe.steps.map((text, index) => <Text key={text} style={[typography.body, { marginBottom: spacing.sm }]}>{index + 1}. {text}</Text>)}
              </View>
            ) : null}
            <Button title={`Use ${recipe.title}`} onPress={() => {
              setDraft(starterRecipeDraft(recipe));
              router.push('/recipe/edit');
            }} />
          </Card>
        ))}
      </CardGrid>
      <Body muted>Use opens a private editable draft. Nothing is added to your recipe book until you tap Save recipe.</Body>
    </Screen>
  );
}
