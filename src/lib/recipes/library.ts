import { emptyDraft, type RecipeDraft } from './draft';
import { draftFromText } from './matching';
import { detectTimerSeconds } from './timers';

export const RECIPE_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type RecipeMealType = (typeof RECIPE_MEAL_TYPES)[number];

export interface StarterRecipe {
  id: string;
  title: string;
  meal: RecipeMealType;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: string[];
  steps: string[];
}

/** Original starter recipes written for Buko; nutrition is matched only when a user saves a copy. */
export const STARTER_RECIPES: StarterRecipe[] = [
  {
    id: 'banana-oats', title: 'Banana cinnamon oats', meal: 'Breakfast', description: 'A warm one-pan breakfast with everyday staples.',
    servings: 1, prepMinutes: 2, cookMinutes: 5,
    ingredients: ['1/2 cup rolled oats', '1 cup milk', '1 banana', '1/4 tsp cinnamon'],
    steps: ['Combine the oats, milk and cinnamon in a small saucepan.', 'Simmer gently for 5 minutes, stirring until the oats soften. Add a splash of water if needed.', 'Slice the banana over the oats and serve.'],
  },
  {
    id: 'yogurt-berry-bowl', title: 'Berry yogurt bowl', meal: 'Breakfast', description: 'No cooking, just a bowl and a spoon.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: ['3/4 cup plain Greek yogurt', '1/2 cup blueberries', '1/4 cup rolled oats', '1 tbsp pumpkin seeds'],
    steps: ['Spoon the yogurt into a bowl.', 'Rinse the berries and add them with the oats and pumpkin seeds. Stir before eating.'],
  },
  {
    id: 'spinach-eggs', title: 'Spinach eggs on toast', meal: 'Breakfast', description: 'A quick savory breakfast for one.',
    servings: 1, prepMinutes: 3, cookMinutes: 7,
    ingredients: ['2 eggs', '1 cup spinach', '1 tsp olive oil', '1 slice whole wheat bread', '1/8 tsp black pepper'],
    steps: ['Toast the bread. Beat the eggs with the pepper.', 'Warm the oil in a skillet and stir the spinach until wilted.', 'Add the eggs and stir gently until firm with no runny egg remaining, reaching 160 F (71 C). Serve on the toast.'],
  },
  {
    id: 'chickpea-wrap', title: 'Lemon chickpea wrap', meal: 'Lunch', description: 'A crunchy, packable vegetarian lunch.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: ['1 1/2 cups canned chickpeas, drained and rinsed', '1/2 cucumber', '1 tomato', '1 tbsp lemon juice', '1 tbsp olive oil', '2 whole wheat tortillas'],
    steps: ['Mash half the chickpeas in a bowl. Dice the cucumber and tomato.', 'Mix the chickpeas, vegetables, lemon juice and oil.', 'Divide between the tortillas and fold into wraps. Keep chilled until serving.'],
  },
  {
    id: 'tuna-bean-salad', title: 'Tuna and white bean salad', meal: 'Lunch', description: 'A pantry-friendly bowl with no stove needed.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: ['1 cup canned tuna, drained', '1 1/2 cups canned white beans, drained and rinsed', '1 tomato', '2 cups lettuce', '1 tbsp olive oil', '1 tbsp lemon juice'],
    steps: ['Chop the tomato and lettuce.', 'Gently toss all ingredients together. Serve immediately or refrigerate until needed.'],
  },
  {
    id: 'hummus-pita', title: 'Hummus veggie pita', meal: 'Lunch', description: 'Fresh vegetables and hummus tucked into pita.',
    servings: 1, prepMinutes: 8, cookMinutes: 0,
    ingredients: ['1 whole wheat pita', '1/4 cup hummus', '1/2 cucumber', '1/2 carrot', '1/2 cup lettuce'],
    steps: ['Slice the cucumber, grate the carrot and shred the lettuce.', 'Open the pita, spread with hummus and fill with the vegetables. Keep chilled if packing for later.'],
  },
  {
    id: 'lemon-chicken-tray', title: 'Lemon chicken and broccoli tray', meal: 'Dinner', description: 'One oven tray and a simple rice side.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: ['300 g chicken breast', '3 cups broccoli', '1 tbsp olive oil', '1 tbsp lemon juice', '1/2 tsp garlic powder', '1 cup cooked brown rice'],
    steps: ['Heat the oven to 425 F (220 C). Cut the broccoli into florets. Use separate utensils for raw chicken.', 'Place the chicken and broccoli on a tray. Coat with the oil, lemon juice and garlic powder.', 'Roast for about 25 minutes, until the chicken reaches 165 F (74 C) at its thickest point and the broccoli is tender. Time varies with thickness.', 'Serve with the rice, reheated until steaming hot if previously chilled.'],
  },
  {
    id: 'tomato-lentil-pasta', title: 'Tomato lentil pasta', meal: 'Dinner', description: 'A filling meat-free pasta with a quick sauce.',
    servings: 2, prepMinutes: 5, cookMinutes: 20,
    ingredients: ['150 g dry whole wheat pasta', '1 cup cooked lentils', '1 1/2 cups canned tomatoes', '1 tsp olive oil', '1 clove garlic', '1 tsp dried oregano'],
    steps: ['Cook the pasta according to the package directions.', 'Mince the garlic and warm it gently in the oil for 1 minute.', 'Add the tomatoes, lentils and oregano. Simmer for 15 minutes, then toss with the drained pasta.'],
  },
  {
    id: 'tofu-vegetable-rice', title: 'Tofu vegetable rice bowl', meal: 'Dinner', description: 'An easy skillet bowl using frozen vegetables.',
    servings: 2, prepMinutes: 10, cookMinutes: 15,
    ingredients: ['300 g firm tofu', '2 cups frozen mixed vegetables', '2 cups cooked brown rice', '1 tbsp olive oil', '1 tbsp reduced sodium soy sauce', '1 tsp grated ginger'],
    steps: ['Drain the tofu, pat dry and cut into cubes.', 'Heat the oil in a skillet and cook the tofu for 8 minutes, turning to brown several sides.', 'Add the frozen vegetables and ginger. Cook until the vegetables are steaming hot and tender, about 7 minutes.', 'Stir in the soy sauce. Serve over hot rice.'],
  },
  {
    id: 'apple-peanut-toast', title: 'Apple peanut butter toast', meal: 'Snack', description: 'Crisp apple and creamy peanut butter.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: ['1 slice whole wheat bread', '1 tbsp peanut butter', '1/2 apple', '1/8 tsp cinnamon'],
    steps: ['Toast the bread and thinly slice the washed apple.', 'Spread the peanut butter on the toast. Top with apple and cinnamon.'],
  },
  {
    id: 'cucumber-cottage-bowl', title: 'Cucumber cottage cheese bowl', meal: 'Snack', description: 'A cool, savory snack in minutes.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: ['1/2 cup cottage cheese', '1/2 cucumber', '1/8 tsp black pepper', '1 tsp lemon juice'],
    steps: ['Dice the washed cucumber.', 'Spoon the cottage cheese into a bowl and top with cucumber, pepper and lemon juice. Serve chilled.'],
  },
  {
    id: 'cocoa-banana-yogurt', title: 'Cocoa banana yogurt', meal: 'Snack', description: 'A lightly sweet snack without cooking.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: ['1/2 cup plain Greek yogurt', '1 banana', '1 tsp unsweetened cocoa powder'],
    steps: ['Mash half the banana with the cocoa, then stir into the yogurt.', 'Slice the remaining banana on top and serve.'],
  },
];

export function starterRecipeDraft(recipe: StarterRecipe): RecipeDraft {
  return {
    ...emptyDraft(), title: recipe.title, servings: recipe.servings,
    prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, sourceName: 'Buko starter library',
    ingredients: recipe.ingredients.map(draftFromText),
    steps: recipe.steps.map((text, position) => ({ position, text, timer_seconds: detectTimerSeconds(text) })),
  };
}
