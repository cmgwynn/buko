import { emptyDraft, type RecipeDraft } from './draft';
import { draftFromText } from './matching';
import { detectTimerSeconds } from './timers';
import { LIBRARY_FOODS, type LibraryFoodKey } from './libraryFoods';
import { computeRecipeNutrition, scoreRecipe } from './nutrition';

export const RECIPE_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type RecipeMealType = (typeof RECIPE_MEAL_TYPES)[number];
export const RECIPE_CUISINES = ['Italian', 'Mexican', 'American', 'Filipino', 'Mediterranean', 'Indian', 'Chinese', 'Japanese', 'Thai', 'Middle Eastern'] as const;
export type RecipeCuisine = (typeof RECIPE_CUISINES)[number];

interface LibraryIngredient {
  food: LibraryFoodKey;
  grams: number;
  name: string;
}

export interface StarterRecipe {
  id: string;
  title: string;
  meal: RecipeMealType;
  cuisine: RecipeCuisine;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: LibraryIngredient[];
  steps: string[];
}

function portion(food: LibraryFoodKey, grams: number, name: string): LibraryIngredient {
  return { food, grams, name };
}

export function libraryIngredientText(ingredient: LibraryIngredient): string {
  return `${ingredient.grams} g ${ingredient.name}`;
}

/** Original, cuisine-inspired recipes; weights refer to the preparation state named in each ingredient. */
export const STARTER_RECIPES: StarterRecipe[] = [
  {
    id: 'banana-oats', title: 'Banana cinnamon oats', meal: 'Breakfast', cuisine: 'American', description: 'A warm one-pan breakfast with everyday staples.',
    servings: 1, prepMinutes: 2, cookMinutes: 5,
    ingredients: [portion('oats', 40, 'rolled oats (dry)'), portion('milk', 240, 'skim milk'), portion('banana', 118, 'peeled banana'), portion('cinnamon', 1, 'ground cinnamon')],
    steps: ['Combine the oats, milk and cinnamon in a small saucepan.', 'Simmer gently for 5 minutes, stirring until the oats soften. Add a splash of water if needed.', 'Slice the banana over the oats and serve.'],
  },
  {
    id: 'yogurt-berry-bowl', title: 'Berry yogurt bowl', meal: 'Breakfast', cuisine: 'American', description: 'No cooking, just a bowl and a spoon.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: [portion('yogurt', 170, 'plain nonfat Greek yogurt'), portion('blueberries', 75, 'blueberries'), portion('oats', 25, 'rolled oats'), portion('pumpkinSeeds', 10, 'unsalted pumpkin seeds')],
    steps: ['Spoon the yogurt into a bowl.', 'Rinse the berries and add them with the oats and pumpkin seeds. Stir before eating.'],
  },
  {
    id: 'spinach-eggs', title: 'Spinach eggs on toast', meal: 'Breakfast', cuisine: 'American', description: 'A quick savory breakfast for one.',
    servings: 1, prepMinutes: 3, cookMinutes: 7,
    ingredients: [portion('egg', 100, 'egg without shells (about 2 large eggs)'), portion('spinach', 50, 'spinach'), portion('oliveOil', 4, 'olive oil'), portion('bread', 40, 'whole-wheat bread'), portion('pepper', 0.3, 'black pepper')],
    steps: ['Toast the bread. Beat the eggs with the pepper.', 'Warm the oil in a skillet and stir the spinach until wilted.', 'Add the eggs and stir gently until firm with no runny egg remaining, reaching 160 F (71 C). Serve on the toast.'],
  },
  {
    id: 'chickpea-wrap', title: 'Lemon chickpea wrap', meal: 'Lunch', cuisine: 'Mediterranean', description: 'A crunchy, packable vegetarian lunch.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('chickpeas', 250, 'cooked chickpeas without salt, drained'), portion('cucumber', 180, 'cucumber with peel'), portion('tomato', 180, 'tomato'), portion('lemon', 20, 'lemon juice'), portion('oliveOil', 10, 'olive oil'), portion('tortilla', 100, 'whole-wheat tortillas (about 2)')],
    steps: ['Prepare the tortillas according to their package cooking directions. Mash half the chickpeas in a bowl. Dice the cucumber and tomato.', 'Mix the chickpeas, vegetables, lemon juice and oil.', 'Divide between the tortillas and fold into wraps. Keep chilled until serving.'],
  },
  {
    id: 'tuna-bean-salad', title: 'Tuna and white bean salad', meal: 'Lunch', cuisine: 'Mediterranean', description: 'A pantry-friendly bowl with no stove needed.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('tuna', 200, 'no-salt-added light tuna in water, drained'), portion('whiteBeans', 300, 'cooked white beans without salt, drained'), portion('tomato', 200, 'tomato'), portion('lettuce', 100, 'romaine lettuce'), portion('oliveOil', 12, 'olive oil'), portion('lemon', 25, 'lemon juice')],
    steps: ['Chop the tomato and lettuce.', 'Gently toss all ingredients together. Serve immediately or refrigerate until needed.'],
  },
  {
    id: 'hummus-pita', title: 'Hummus veggie pita', meal: 'Lunch', cuisine: 'Middle Eastern', description: 'Fresh vegetables and hummus tucked into pita.',
    servings: 1, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('pita', 65, 'whole-wheat pita'), portion('hummus', 70, 'hummus'), portion('cucumber', 100, 'cucumber with peel'), portion('carrot', 60, 'carrot'), portion('lettuce', 40, 'romaine lettuce')],
    steps: ['Slice the cucumber, grate the carrot and shred the lettuce.', 'Open the pita, spread with hummus and fill with the vegetables. Keep chilled if packing for later.'],
  },
  {
    id: 'lemon-chicken-tray', title: 'Lemon chicken and broccoli tray', meal: 'Dinner', cuisine: 'American', description: 'One oven tray and a simple rice side.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('broccoli', 300, 'broccoli'), portion('oliveOil', 12, 'olive oil'), portion('lemon', 20, 'lemon juice'), portion('garlicPowder', 2, 'garlic powder'), portion('brownRice', 300, 'cooked brown rice without added salt')],
    steps: ['Heat the oven to 425 F (220 C). Cut the broccoli into florets. Use separate utensils for raw chicken.', 'Place the chicken and broccoli on a tray. Coat with the oil, lemon juice and garlic powder.', 'Roast for about 25 minutes, until the chicken reaches 165 F (74 C) at its thickest point and the broccoli is tender. Time varies with thickness.', 'Serve with the rice, reheated until steaming hot if previously chilled.'],
  },
  {
    id: 'tomato-lentil-pasta', title: 'Tomato lentil pasta', meal: 'Dinner', cuisine: 'Italian', description: 'A filling meat-free pasta with a quick sauce.',
    servings: 2, prepMinutes: 5, cookMinutes: 20,
    ingredients: [portion('pasta', 150, 'dry whole-wheat pasta'), portion('lentils', 200, 'cooked lentils without salt'), portion('cannedTomato', 350, 'canned crushed tomatoes'), portion('oliveOil', 5, 'olive oil'), portion('garlic', 6, 'garlic'), portion('oregano', 1, 'dried oregano')],
    steps: ['Cook the pasta according to the package directions, without added salt.', 'Mince the garlic and warm it gently in the oil for 1 minute.', 'Add the tomatoes, lentils and oregano. Simmer for 15 minutes, then toss with the drained pasta.'],
  },
  {
    id: 'tofu-vegetable-rice', title: 'Tofu vegetable rice bowl', meal: 'Dinner', cuisine: 'Chinese', description: 'An easy skillet bowl with crisp vegetables.',
    servings: 2, prepMinutes: 10, cookMinutes: 15,
    ingredients: [portion('tofu', 300, 'firm calcium-set tofu, drained'), portion('broccoli', 200, 'broccoli'), portion('carrot', 150, 'carrot'), portion('brownRice', 300, 'cooked brown rice without added salt'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 12, 'reduced-sodium soy sauce'), portion('ginger', 8, 'fresh ginger')],
    steps: ['Drain the tofu, pat dry and cut into cubes. Slice the carrot and broccoli thinly.', 'Heat the oil in a skillet and cook the tofu for 8 minutes, turning to brown several sides.', 'Add the vegetables, ginger and a splash of water. Cook until the vegetables are steaming hot and tender, about 7 minutes.', 'Stir in the soy sauce. Serve over hot rice.'],
  },
  {
    id: 'apple-peanut-toast', title: 'Apple peanut butter toast', meal: 'Snack', cuisine: 'American', description: 'Crisp apple and creamy peanut butter.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: [portion('bread', 35, 'whole-wheat bread'), portion('peanutButter', 16, 'unsalted peanut butter'), portion('apple', 90, 'apple with skin'), portion('cinnamon', 0.5, 'ground cinnamon')],
    steps: ['Toast the bread and thinly slice the washed apple.', 'Spread the peanut butter on the toast. Top with apple and cinnamon.'],
  },
  {
    id: 'cucumber-cottage-bowl', title: 'Cucumber cottage cheese bowl', meal: 'Snack', cuisine: 'American', description: 'A cool, savory snack in minutes.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: [portion('cottageCheese', 120, '1% cottage cheese'), portion('cucumber', 120, 'cucumber with peel'), portion('pepper', 0.3, 'black pepper'), portion('lemon', 5, 'lemon juice')],
    steps: ['Dice the washed cucumber.', 'Spoon the cottage cheese into a bowl and top with cucumber, pepper and lemon juice. Serve chilled.'],
  },
  {
    id: 'cocoa-banana-yogurt', title: 'Cocoa banana yogurt', meal: 'Snack', cuisine: 'American', description: 'A lightly sweet snack without cooking.',
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: [portion('yogurt', 120, 'plain nonfat Greek yogurt'), portion('banana', 100, 'peeled banana'), portion('cocoa', 3, 'unsweetened cocoa powder')],
    steps: ['Mash half the banana with the cocoa, then stir into the yogurt.', 'Slice the remaining banana on top and serve.'],
  },
  {
    id: 'italian-tomato-egg-toast', title: 'Tomato oregano egg toast', meal: 'Breakfast', cuisine: 'Italian', description: 'Soft tomatoes and eggs over whole-grain toast.',
    servings: 1, prepMinutes: 5, cookMinutes: 10,
    ingredients: [portion('egg', 100, 'egg without shells'), portion('tomato', 160, 'tomato'), portion('spinach', 40, 'spinach'), portion('bread', 50, 'whole-wheat bread'), portion('oliveOil', 4, 'olive oil'), portion('oregano', 1, 'dried oregano')],
    steps: ['Dice the tomato and cook with oil and oregano in a nonstick skillet for 5 minutes.', 'Add spinach, then beaten eggs. Stir until firm and the egg reaches 160 F (71 C).', 'Toast the bread and spoon the tomato eggs on top.'],
  },
  {
    id: 'italian-white-bean-bruschetta', title: 'White bean tomato bruschetta', meal: 'Lunch', cuisine: 'Italian', description: 'Creamy beans and chopped tomato on crunchy toast.',
    servings: 2, prepMinutes: 10, cookMinutes: 5,
    ingredients: [portion('whiteBeans', 280, 'cooked white beans without salt'), portion('tomato', 250, 'tomato'), portion('bread', 120, 'whole-wheat bread'), portion('oliveOil', 8, 'olive oil'), portion('lemon', 15, 'lemon juice'), portion('garlic', 4, 'garlic'), portion('parsley', 10, 'fresh parsley')],
    steps: ['Mash half the beans with the oil, lemon juice and finely grated garlic.', 'Dice the tomato and chop the parsley; fold into the remaining beans.', 'Toast the bread. Spread with mashed beans, then add the tomato mixture.'],
  },
  {
    id: 'italian-lentil-minestrone', title: 'Lentil vegetable minestrone', meal: 'Lunch', cuisine: 'Italian', description: 'A tomato-rich soup with lentils and a little pasta.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('lentils', 250, 'cooked lentils without salt'), portion('pasta', 90, 'dry whole-wheat pasta'), portion('cannedTomato', 350, 'canned crushed tomatoes'), portion('zucchini', 200, 'zucchini'), portion('carrot', 120, 'carrot'), portion('onion', 80, 'onion'), portion('oliveOil', 8, 'olive oil'), portion('oregano', 1, 'dried oregano')],
    steps: ['Dice the vegetables. Soften onion and carrot in oil for 5 minutes.', 'Add tomatoes, zucchini, oregano and 500 ml water. Bring to a boil, add pasta and simmer for the package cooking time, stirring.', 'Add lentils and heat until steaming throughout. Add water if needed for your preferred soup texture.'],
  },
  {
    id: 'italian-chicken-pepper-skillet', title: 'Chicken pepper tomato skillet', meal: 'Dinner', cuisine: 'Italian', description: 'A simple tomato skillet served with brown rice.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('bellPepper', 250, 'red bell pepper'), portion('cannedTomato', 250, 'canned crushed tomatoes'), portion('onion', 100, 'onion'), portion('brownRice', 300, 'cooked brown rice'), portion('oliveOil', 10, 'olive oil'), portion('oregano', 2, 'dried oregano')],
    steps: ['Slice chicken and vegetables using separate boards and utensils.', 'Warm oil in a skillet. Cook onion and pepper for 5 minutes; add chicken and cook for 5 minutes, turning.', 'Add tomatoes and oregano. Cover and simmer until the chicken reaches 165 F (74 C), about 15 minutes.', 'Serve over rice reheated until steaming hot.'],
  },
  {
    id: 'italian-stuffed-zucchini', title: 'Lentil stuffed zucchini boats', meal: 'Dinner', cuisine: 'Italian', description: 'Oven-baked zucchini with a herby lentil filling.',
    servings: 2, prepMinutes: 15, cookMinutes: 30,
    ingredients: [portion('zucchini', 500, 'zucchini'), portion('lentils', 300, 'cooked lentils without salt'), portion('brownRice', 260, 'cooked brown rice'), portion('cannedTomato', 200, 'canned crushed tomatoes'), portion('oliveOil', 10, 'olive oil'), portion('garlic', 6, 'garlic'), portion('oregano', 2, 'dried oregano')],
    steps: ['Heat oven to 400 F (200 C). Halve zucchini lengthwise and scoop a shallow channel; chop the scooped flesh.', 'Mix the flesh with lentils, rice, tomatoes, minced garlic and oregano. Brush zucchini with oil and fill.', 'Place in a baking dish with a splash of water. Cover and bake for 20 minutes; uncover and bake for 10 minutes until tender and piping hot.'],
  },
  {
    id: 'italian-cucumber-bean-cups', title: 'Lemon bean cucumber cups', meal: 'Snack', cuisine: 'Italian', description: 'Cool cucumber rounds with a lemony white bean spread.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('whiteBeans', 180, 'cooked white beans without salt'), portion('cucumber', 200, 'cucumber with peel'), portion('lemon', 15, 'lemon juice'), portion('oliveOil', 5, 'olive oil'), portion('parsley', 8, 'fresh parsley')],
    steps: ['Mash beans with lemon juice, oil and chopped parsley.', 'Cut cucumber into thick rounds and scoop a small dip from the center. Spoon bean spread on top; keep chilled.'],
  },
  {
    id: 'mexican-breakfast-beans', title: 'Black bean breakfast skillet', meal: 'Breakfast', cuisine: 'Mexican', description: 'Eggs, beans and peppers with bright lime.',
    servings: 2, prepMinutes: 10, cookMinutes: 15,
    ingredients: [portion('blackBeans', 240, 'cooked black beans without salt'), portion('egg', 200, 'egg without shells'), portion('bellPepper', 160, 'red bell pepper'), portion('tomato', 200, 'tomato'), portion('oliveOil', 6, 'olive oil'), portion('cumin', 2, 'ground cumin'), portion('lime', 15, 'lime juice')],
    steps: ['Dice pepper and tomato. Cook in oil with cumin for 5 minutes.', 'Add beans and heat until steaming. Make four spaces and add eggs.', 'Cover and cook over low heat until eggs are firm and reach 160 F (71 C). Finish with lime juice.'],
  },
  {
    id: 'mexican-lime-chicken-bowl', title: 'Lime chicken corn bowl', meal: 'Lunch', cuisine: 'Mexican', description: 'A colorful rice bowl with chicken and corn.',
    servings: 2, prepMinutes: 10, cookMinutes: 18,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('brownRice', 300, 'cooked brown rice'), portion('corn', 150, 'frozen corn kernels'), portion('bellPepper', 180, 'red bell pepper'), portion('avocado', 80, 'avocado flesh'), portion('oliveOil', 8, 'olive oil'), portion('lime', 25, 'lime juice'), portion('cumin', 2, 'ground cumin')],
    steps: ['Cut chicken and pepper separately. Heat oil and cook chicken with cumin for 8 minutes, turning.', 'Add pepper and corn; cook until vegetables are hot and chicken reaches 165 F (74 C).', 'Divide hot rice between bowls, top with chicken and vegetables, then add diced avocado and lime juice.'],
  },
  {
    id: 'mexican-black-bean-wraps', title: 'Crunchy black bean wraps', meal: 'Lunch', cuisine: 'Mexican', description: 'Packable bean wraps with cabbage and yogurt lime sauce.',
    servings: 2, prepMinutes: 15, cookMinutes: 0,
    ingredients: [portion('blackBeans', 280, 'cooked black beans without salt'), portion('tortilla', 100, 'whole-wheat tortillas'), portion('cabbage', 140, 'cabbage'), portion('tomato', 160, 'tomato'), portion('yogurt', 80, 'plain nonfat Greek yogurt'), portion('lime', 20, 'lime juice'), portion('cumin', 1, 'ground cumin')],
    steps: ['Prepare the tortillas according to their package cooking directions. Shred cabbage and dice tomato. Mash beans lightly with cumin.', 'Mix yogurt and lime juice. Fill tortillas with beans and vegetables; spoon sauce over and roll. Keep chilled.'],
  },
  {
    id: 'mexican-sweet-potato-chili', title: 'Sweet potato black bean chili', meal: 'Dinner', cuisine: 'Mexican', description: 'A warming plant-based pot with no packet seasoning.',
    servings: 2, prepMinutes: 10, cookMinutes: 30,
    ingredients: [portion('sweetPotato', 300, 'sweet potato'), portion('blackBeans', 300, 'cooked black beans without salt'), portion('cannedTomato', 350, 'canned crushed tomatoes'), portion('onion', 100, 'onion'), portion('bellPepper', 150, 'red bell pepper'), portion('oliveOil', 10, 'olive oil'), portion('cumin', 3, 'ground cumin'), portion('chili', 0.5, 'ground cayenne pepper')],
    steps: ['Dice sweet potato into 1 cm cubes; chop onion and pepper.', 'Soften onion and pepper in oil for 5 minutes. Stir in cumin and cayenne.', 'Add sweet potato, tomatoes and 200 ml water. Simmer covered for 20 minutes until potato is tender.', 'Add beans and simmer for 5 minutes until steaming hot.'],
  },
  {
    id: 'mexican-salmon-tacos', title: 'Salmon cabbage tacos', meal: 'Dinner', cuisine: 'Mexican', description: 'Flaked salmon and crunchy slaw in whole-wheat tortillas.',
    servings: 2, prepMinutes: 15, cookMinutes: 15,
    ingredients: [portion('salmon', 280, 'raw boneless salmon'), portion('tortilla', 100, 'whole-wheat tortillas'), portion('cabbage', 200, 'cabbage'), portion('tomato', 180, 'tomato'), portion('yogurt', 80, 'plain nonfat Greek yogurt'), portion('lime', 25, 'lime juice'), portion('oliveOil', 5, 'olive oil'), portion('cumin', 2, 'ground cumin')],
    steps: ['Heat oven to 400 F (200 C). Coat salmon with oil and cumin; bake for about 15 minutes until it reaches 145 F (63 C).', 'Shred cabbage and dice tomato. Mix yogurt with lime juice. Prepare tortillas according to package cooking directions.', 'Check salmon for bones and flake into warmed tortillas. Add vegetables and yogurt sauce.'],
  },
  {
    id: 'mexican-avocado-bean-dip', title: 'Avocado bean dip with vegetables', meal: 'Snack', cuisine: 'Mexican', description: 'A small creamy dip with crisp vegetable sticks.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('avocado', 100, 'avocado flesh'), portion('whiteBeans', 120, 'cooked white beans without salt'), portion('lime', 20, 'lime juice'), portion('cucumber', 160, 'cucumber with peel'), portion('carrot', 100, 'carrot'), portion('cumin', 1, 'ground cumin')],
    steps: ['Mash avocado and beans with lime juice and cumin.', 'Slice cucumber and carrot into sticks. Divide dip into two bowls and serve with the vegetables.'],
  },
  {
    id: 'american-apple-overnight-oats', title: 'Apple pie overnight oats', meal: 'Breakfast', cuisine: 'American', description: 'Cinnamon apple flavor without added sugar.',
    servings: 1, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('oats', 45, 'rolled oats'), portion('milk', 150, 'skim milk'), portion('yogurt', 100, 'plain nonfat Greek yogurt'), portion('apple', 120, 'apple with skin'), portion('cinnamon', 1, 'ground cinnamon'), portion('pumpkinSeeds', 10, 'unsalted pumpkin seeds')],
    steps: ['Grate the apple and mix with oats, milk, yogurt and cinnamon.', 'Cover and refrigerate for at least 4 hours. Top with pumpkin seeds before eating. Prep time excludes chilling.'],
  },
  {
    id: 'american-chicken-crunch-salad', title: 'Chicken apple crunch salad', meal: 'Lunch', cuisine: 'American', description: 'A fresh salad with a lemon yogurt dressing.',
    servings: 2, prepMinutes: 15, cookMinutes: 18,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('apple', 180, 'apple with skin'), portion('lettuce', 160, 'romaine lettuce'), portion('carrot', 120, 'carrot'), portion('yogurt', 100, 'plain nonfat Greek yogurt'), portion('lemon', 20, 'lemon juice'), portion('bread', 100, 'whole-wheat bread'), portion('oliveOil', 6, 'olive oil')],
    steps: ['Slice chicken on a separate board and cook in oil, turning, until it reaches 165 F (74 C), about 12-18 minutes.', 'Dice apple, shred carrot and lettuce. Mix yogurt and lemon juice.', 'Toss vegetables and apple with dressing, top with chicken and serve with toasted bread.'],
  },
  {
    id: 'american-sweet-potato-bean-bowl', title: 'Sweet potato bean lunch bowl', meal: 'Lunch', cuisine: 'American', description: 'Roasted sweet potato with beans and leafy greens.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('sweetPotato', 350, 'sweet potato'), portion('blackBeans', 280, 'cooked black beans without salt'), portion('spinach', 100, 'spinach'), portion('tomato', 180, 'tomato'), portion('oliveOil', 10, 'olive oil'), portion('yogurt', 80, 'plain nonfat Greek yogurt'), portion('lemon', 15, 'lemon juice')],
    steps: ['Heat oven to 425 F (220 C). Dice sweet potato, coat in oil and roast for 25 minutes until tender.', 'Warm beans with a splash of water until steaming. Mix yogurt and lemon juice.', 'Divide spinach and chopped tomato into bowls. Add sweet potato, beans and yogurt sauce.'],
  },
  {
    id: 'american-salmon-sheet-pan', title: 'Salmon potato green bean tray', meal: 'Dinner', cuisine: 'American', description: 'A complete oven dinner with lemon and garlic.',
    servings: 2, prepMinutes: 10, cookMinutes: 30,
    ingredients: [portion('salmon', 300, 'raw boneless salmon'), portion('potato', 350, 'potato with skin'), portion('greenBeans', 250, 'green beans'), portion('oliveOil', 12, 'olive oil'), portion('lemon', 25, 'lemon juice'), portion('garlic', 6, 'garlic')],
    steps: ['Heat oven to 425 F (220 C). Slice potatoes into thin wedges and toss with half the oil. Roast for 15 minutes.', 'Add beans and salmon on a separate part of the tray. Drizzle with remaining oil, lemon juice and minced garlic.', 'Roast for another 12-15 minutes until potatoes are tender and salmon reaches 145 F (63 C). Check for bones before serving.'],
  },
  {
    id: 'american-lentil-cottage-pie', title: 'Lentil vegetable cottage pie', meal: 'Dinner', cuisine: 'American', description: 'A meat-free skillet bake under a simple potato topping.',
    servings: 2, prepMinutes: 15, cookMinutes: 35,
    ingredients: [portion('lentils', 300, 'cooked lentils without salt'), portion('potato', 400, 'potato with skin'), portion('carrot', 160, 'carrot'), portion('mushrooms', 180, 'white mushrooms'), portion('onion', 80, 'onion'), portion('cannedTomato', 200, 'canned crushed tomatoes'), portion('milk', 80, 'skim milk'), portion('oliveOil', 8, 'olive oil')],
    steps: ['Heat oven to 400 F (200 C). Cut potatoes into chunks and boil in water for 15 minutes until tender. Drain and mash with milk.', 'Dice vegetables. Cook onion, carrot and mushrooms in oil for 8 minutes. Add tomatoes and lentils; simmer for 5 minutes.', 'Spoon filling into a small baking dish, spread potatoes on top and bake for 15 minutes until steaming throughout.'],
  },
  {
    id: 'american-berry-yogurt-dip', title: 'Berry yogurt dip and apple', meal: 'Snack', cuisine: 'American', description: 'A fruit-and-yogurt snack with a little cocoa.',
    servings: 2, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('yogurt', 240, 'plain nonfat Greek yogurt'), portion('blueberries', 100, 'blueberries'), portion('apple', 200, 'apple with skin'), portion('cocoa', 4, 'unsweetened cocoa powder')],
    steps: ['Mash the blueberries and stir into yogurt with cocoa.', 'Slice apples and divide between two plates with the yogurt dip. Keep chilled.'],
  },
  {
    id: 'filipino-garlic-breakfast-rice', title: 'Garlic breakfast rice and egg', meal: 'Breakfast', cuisine: 'Filipino', description: 'Brown rice with garlic, spinach and a fully cooked egg.',
    servings: 2, prepMinutes: 8, cookMinutes: 12,
    ingredients: [portion('brownRice', 300, 'cooked brown rice'), portion('egg', 200, 'egg without shells'), portion('spinach', 100, 'spinach'), portion('tomato', 200, 'tomato'), portion('garlic', 12, 'garlic'), portion('oliveOil', 8, 'olive oil')],
    steps: ['Finely chop garlic. Warm half the oil and cook garlic gently for 1 minute without burning.', 'Add rice, spinach and a splash of water; stir until steaming throughout.', 'In another pan, cook eggs in remaining oil until firm and 160 F (71 C). Serve with hot garlic rice and sliced tomato.'],
  },
  {
    id: 'filipino-chicken-cabbage-rice', title: 'Ginger chicken cabbage bowl', meal: 'Lunch', cuisine: 'Filipino', description: 'Ginger and garlic bring flavor to a quick lunch bowl.',
    servings: 2, prepMinutes: 10, cookMinutes: 20,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('cabbage', 250, 'cabbage'), portion('carrot', 120, 'carrot'), portion('brownRice', 300, 'cooked brown rice'), portion('ginger', 15, 'fresh ginger'), portion('garlic', 8, 'garlic'), portion('oliveOil', 8, 'olive oil'), portion('soySauce', 10, 'reduced-sodium soy sauce')],
    steps: ['Slice chicken on a separate board. Shred cabbage and carrot, and mince ginger and garlic.', 'Cook chicken in oil for 8 minutes, turning. Add vegetables, ginger, garlic and a splash of water.', 'Cover and cook until vegetables are tender and chicken reaches 165 F (74 C). Stir in soy sauce and serve over steaming rice.'],
  },
  {
    id: 'filipino-tomato-white-beans', title: 'Tomato white bean rice bowl', meal: 'Lunch', cuisine: 'Filipino', description: 'A simple tomato-garlic bean bowl inspired by home-style stews.',
    servings: 2, prepMinutes: 10, cookMinutes: 18,
    ingredients: [portion('whiteBeans', 300, 'cooked white beans without salt'), portion('tomato', 300, 'tomato'), portion('spinach', 100, 'spinach'), portion('brownRice', 280, 'cooked brown rice'), portion('onion', 80, 'onion'), portion('garlic', 10, 'garlic'), portion('oliveOil', 8, 'olive oil')],
    steps: ['Dice onion and tomato; mince garlic. Soften onion in oil for 5 minutes.', 'Add garlic and tomato; simmer with a splash of water for 8 minutes.', 'Add beans and spinach and heat until steaming. Serve over hot rice.'],
  },
  {
    id: 'filipino-adobo-inspired-chicken', title: 'Vinegar garlic chicken and greens', meal: 'Dinner', cuisine: 'Filipino', description: 'An adobo-inspired skillet with a smaller amount of soy sauce.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('greenBeans', 250, 'green beans'), portion('brownRice', 300, 'cooked brown rice'), portion('vinegar', 35, 'cider vinegar'), portion('soySauce', 15, 'reduced-sodium soy sauce'), portion('garlic', 15, 'garlic'), portion('oliveOil', 8, 'olive oil'), portion('pepper', 1, 'black pepper')],
    steps: ['Cut chicken into chunks on a separate board. Warm oil in a skillet and brown chicken for 5 minutes.', 'Add crushed garlic, vinegar, soy sauce, pepper and 120 ml water. Bring to a boil, cover and simmer for 12 minutes.', 'Add trimmed beans and simmer until beans are tender and chicken reaches 165 F (74 C). Serve with steaming rice.'],
  },
  {
    id: 'filipino-ginger-fish-soup', title: 'Ginger salmon vegetable soup', meal: 'Dinner', cuisine: 'Filipino', description: 'A clear ginger broth with salmon, cabbage and rice.',
    servings: 2, prepMinutes: 12, cookMinutes: 20,
    ingredients: [portion('salmon', 280, 'raw boneless salmon'), portion('cabbage', 220, 'cabbage'), portion('tomato', 220, 'tomato'), portion('spinach', 80, 'spinach'), portion('brownRice', 300, 'cooked brown rice'), portion('ginger', 20, 'fresh ginger'), portion('onion', 80, 'onion'), portion('lime', 20, 'lime juice')],
    steps: ['Slice ginger and onion. Simmer in 600 ml water for 8 minutes.', 'Add chopped tomato and cabbage; simmer for 5 minutes.', 'Add salmon pieces and simmer gently until they reach 145 F (63 C), about 6-8 minutes. Add spinach to wilt, check for bones and finish with lime juice.', 'Serve with rice reheated until steaming hot.'],
  },
  {
    id: 'filipino-pineapple-yogurt-cups', title: 'Pineapple banana yogurt cups', meal: 'Snack', cuisine: 'Filipino', description: 'A tropical fruit snack with plain yogurt, not sweetened syrup.',
    servings: 2, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('pineapple', 200, 'fresh pineapple flesh'), portion('banana', 100, 'peeled banana'), portion('yogurt', 200, 'plain nonfat Greek yogurt'), portion('pumpkinSeeds', 12, 'unsalted pumpkin seeds')],
    steps: ['Dice pineapple and slice banana.', 'Layer fruit and yogurt in two cups. Sprinkle with pumpkin seeds and serve chilled.'],
  },
  {
    id: 'mediterranean-yogurt-apple-oats', title: 'Apple seed yogurt oats', meal: 'Breakfast', cuisine: 'Mediterranean', description: 'A creamy breakfast with whole grains and crunchy seeds.',
    servings: 1, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('yogurt', 200, 'plain nonfat Greek yogurt'), portion('apple', 130, 'apple with skin'), portion('oats', 35, 'rolled oats'), portion('pumpkinSeeds', 15, 'unsalted pumpkin seeds'), portion('cinnamon', 1, 'ground cinnamon')],
    steps: ['Grate the apple and mix with yogurt, oats and cinnamon.', 'Let stand for 5 minutes to soften the oats, then top with seeds.'],
  },
  {
    id: 'mediterranean-chickpea-bulgur', title: 'Lemon chickpea bulgur salad', meal: 'Lunch', cuisine: 'Mediterranean', description: 'A make-ahead grain salad with generous vegetables.',
    servings: 2, prepMinutes: 15, cookMinutes: 0,
    ingredients: [portion('bulgur', 300, 'cooked bulgur without salt'), portion('chickpeas', 240, 'cooked chickpeas without salt'), portion('cucumber', 200, 'cucumber with peel'), portion('tomato', 220, 'tomato'), portion('parsley', 20, 'fresh parsley'), portion('lemon', 30, 'lemon juice'), portion('oliveOil', 12, 'olive oil')],
    steps: ['Use cooled, safely refrigerated bulgur. Dice cucumber and tomato; chop parsley.', 'Toss all ingredients together and divide into two bowls. Keep chilled until serving.'],
  },
  {
    id: 'mediterranean-tuna-potato-salad', title: 'Tuna potato green bean salad', meal: 'Lunch', cuisine: 'Mediterranean', description: 'A warm potato salad with tuna and lemon dressing.',
    servings: 2, prepMinutes: 10, cookMinutes: 20,
    ingredients: [portion('tuna', 220, 'no-salt-added light tuna in water, drained'), portion('potato', 400, 'potato with skin'), portion('greenBeans', 250, 'green beans'), portion('tomato', 180, 'tomato'), portion('oliveOil', 12, 'olive oil'), portion('lemon', 25, 'lemon juice'), portion('parsley', 10, 'fresh parsley')],
    steps: ['Cut potatoes into small chunks. Boil for 12 minutes, add trimmed beans and cook until both are tender, about 5 minutes more. Drain.', 'Whisk oil and lemon juice. Toss potatoes, beans, tuna, diced tomato and parsley with the dressing.'],
  },
  {
    id: 'mediterranean-lemon-salmon-bulgur', title: 'Lemon salmon bulgur bowls', meal: 'Dinner', cuisine: 'Mediterranean', description: 'Baked salmon with vegetables and a lemony grain base.',
    servings: 2, prepMinutes: 10, cookMinutes: 20,
    ingredients: [portion('salmon', 300, 'raw boneless salmon'), portion('bulgur', 320, 'cooked bulgur without salt'), portion('zucchini', 250, 'zucchini'), portion('tomato', 200, 'tomato'), portion('oliveOil', 10, 'olive oil'), portion('lemon', 30, 'lemon juice'), portion('oregano', 2, 'dried oregano')],
    steps: ['Heat oven to 400 F (200 C). Slice zucchini and tomatoes and place in a baking dish with salmon.', 'Drizzle with oil and half the lemon juice, sprinkle oregano and bake for about 20 minutes until salmon reaches 145 F (63 C).', 'Heat bulgur until steaming; stir in remaining lemon juice. Top with vegetables and boneless salmon pieces.'],
  },
  {
    id: 'mediterranean-chickpea-pepper-stew', title: 'Chickpea pepper spinach stew', meal: 'Dinner', cuisine: 'Mediterranean', description: 'A one-pot vegetable stew with a whole-grain side.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('chickpeas', 300, 'cooked chickpeas without salt'), portion('bellPepper', 250, 'red bell pepper'), portion('cannedTomato', 300, 'canned crushed tomatoes'), portion('spinach', 120, 'spinach'), portion('bulgur', 250, 'cooked bulgur without salt'), portion('onion', 80, 'onion'), portion('oliveOil', 10, 'olive oil'), portion('garlic', 8, 'garlic')],
    steps: ['Chop onion and pepper. Soften in oil for 7 minutes, then add minced garlic.', 'Add tomatoes and chickpeas. Simmer for 15 minutes with a splash of water if needed.', 'Stir spinach into the stew until wilted and steaming hot. Serve with hot bulgur.'],
  },
  {
    id: 'mediterranean-lemon-hummus-plate', title: 'Lemon hummus vegetable plate', meal: 'Snack', cuisine: 'Mediterranean', description: 'A quick dip plate with vegetables and a little pita.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('hummus', 100, 'hummus'), portion('lemon', 15, 'lemon juice'), portion('cucumber', 200, 'cucumber with peel'), portion('carrot', 150, 'carrot'), portion('pita', 50, 'whole-wheat pita')],
    steps: ['Stir lemon juice into hummus.', 'Cut vegetables into sticks and pita into wedges. Divide with the hummus and keep chilled.'],
  },
  {
    id: 'indian-savory-oats', title: 'Turmeric vegetable breakfast oats', meal: 'Breakfast', cuisine: 'Indian', description: 'Savory oats with vegetables, cumin and yogurt.',
    servings: 2, prepMinutes: 10, cookMinutes: 15,
    ingredients: [portion('oats', 90, 'rolled oats (dry)'), portion('carrot', 120, 'carrot'), portion('spinach', 80, 'spinach'), portion('tomato', 160, 'tomato'), portion('yogurt', 160, 'plain nonfat Greek yogurt'), portion('oliveOil', 8, 'olive oil'), portion('cumin', 2, 'ground cumin'), portion('turmeric', 1, 'ground turmeric')],
    steps: ['Grate carrot and dice tomato. Cook in oil with cumin and turmeric for 5 minutes.', 'Add oats and 450 ml water. Simmer for 8 minutes, stirring; add spinach and cook until wilted.', 'Spoon into bowls and add yogurt just before serving.'],
  },
  {
    id: 'indian-chickpea-spinach-bowl', title: 'Chickpea spinach rice bowl', meal: 'Lunch', cuisine: 'Indian', description: 'A quick tomato chickpea curry with a yogurt finish.',
    servings: 2, prepMinutes: 10, cookMinutes: 20,
    ingredients: [portion('chickpeas', 280, 'cooked chickpeas without salt'), portion('spinach', 150, 'spinach'), portion('cannedTomato', 250, 'canned crushed tomatoes'), portion('brownRice', 300, 'cooked brown rice'), portion('yogurt', 80, 'plain nonfat Greek yogurt'), portion('onion', 80, 'onion'), portion('oliveOil', 8, 'olive oil'), portion('cumin', 2, 'ground cumin'), portion('turmeric', 1, 'ground turmeric')],
    steps: ['Dice onion and soften in oil for 5 minutes. Stir in cumin and turmeric.', 'Add tomatoes and chickpeas; simmer for 12 minutes with a splash of water if needed.', 'Stir in spinach until wilted. Serve with steaming rice and yogurt.'],
  },
  {
    id: 'indian-lentil-cucumber-salad', title: 'Lentil cucumber chaat-inspired salad', meal: 'Lunch', cuisine: 'Indian', description: 'Cooked lentils, fresh vegetables and lemon cumin dressing.',
    servings: 2, prepMinutes: 15, cookMinutes: 20,
    ingredients: [portion('lentils', 320, 'cooked lentils without salt'), portion('cucumber', 200, 'cucumber with peel'), portion('tomato', 200, 'tomato'), portion('potato', 240, 'raw potato with skin'), portion('lemon', 30, 'lemon juice'), portion('oliveOil', 8, 'olive oil'), portion('cumin', 2, 'ground cumin'), portion('cilantro', 15, 'fresh cilantro')],
    steps: ['Cut the weighed potato into chunks and boil for about 20 minutes until tender. Drain.', 'Dice cucumber and tomato. Toss with lentils and warm potato, then add lemon juice, oil, cumin and chopped cilantro. Serve warm, or cool promptly and refrigerate.'],
  },
  {
    id: 'indian-red-lentil-style-dal', title: 'Ginger lentil vegetable dal', meal: 'Dinner', cuisine: 'Indian', description: 'A gentle lentil bowl using ready-cooked lentils.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('lentils', 350, 'cooked lentils without salt'), portion('cannedTomato', 250, 'canned crushed tomatoes'), portion('cauliflower', 250, 'cauliflower'), portion('brownRice', 280, 'cooked brown rice'), portion('onion', 80, 'onion'), portion('ginger', 15, 'fresh ginger'), portion('garlic', 8, 'garlic'), portion('oliveOil', 8, 'olive oil'), portion('turmeric', 1, 'ground turmeric'), portion('cumin', 2, 'ground cumin')],
    steps: ['Chop onion, ginger and garlic. Cook gently in oil for 5 minutes with cumin and turmeric.', 'Add small cauliflower florets, tomatoes and 200 ml water; simmer for 12 minutes.', 'Add lentils and simmer for 8 minutes until cauliflower is tender. Mash lightly to thicken and serve with hot rice.'],
  },
  {
    id: 'indian-yogurt-chicken-tray', title: 'Yogurt spice chicken and cauliflower', meal: 'Dinner', cuisine: 'Indian', description: 'A yogurt-coated chicken tray with warm spices.',
    servings: 2, prepMinutes: 15, cookMinutes: 30,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('yogurt', 100, 'plain nonfat Greek yogurt'), portion('cauliflower', 350, 'cauliflower'), portion('brownRice', 300, 'cooked brown rice'), portion('lemon', 25, 'lemon juice'), portion('oliveOil', 10, 'olive oil'), portion('cumin', 3, 'ground cumin'), portion('turmeric', 1, 'ground turmeric'), portion('garlic', 8, 'garlic')],
    steps: ['Heat oven to 425 F (220 C). Mix yogurt, lemon juice, spices and minced garlic. Coat chicken using separate raw-meat utensils.', 'Place chicken on one side of a tray. Toss cauliflower with oil and place beside it.', 'Roast for about 30 minutes until chicken reaches 165 F (74 C) and cauliflower is tender. Serve over steaming rice. Discard any unused raw-chicken marinade.'],
  },
  {
    id: 'indian-cucumber-yogurt-chickpeas', title: 'Cucumber yogurt chickpea cups', meal: 'Snack', cuisine: 'Indian', description: 'A chilled raita-inspired snack with chickpeas.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('yogurt', 200, 'plain nonfat Greek yogurt'), portion('cucumber', 200, 'cucumber with peel'), portion('chickpeas', 120, 'cooked chickpeas without salt'), portion('cumin', 1, 'ground cumin'), portion('lemon', 10, 'lemon juice')],
    steps: ['Grate cucumber and gently squeeze out excess liquid.', 'Mix yogurt with cucumber, cumin and lemon juice. Divide into two cups and top with chickpeas. Keep chilled.'],
  },
  {
    id: 'chinese-tomato-eggs-rice', title: 'Tomato eggs and brown rice', meal: 'Breakfast', cuisine: 'Chinese', description: 'Juicy tomatoes and soft-set eggs over rice.',
    servings: 2, prepMinutes: 8, cookMinutes: 12,
    ingredients: [portion('egg', 200, 'egg without shells'), portion('tomato', 350, 'tomato'), portion('brownRice', 260, 'cooked brown rice'), portion('spinach', 80, 'spinach'), portion('oliveOil', 8, 'olive oil'), portion('soySauce', 8, 'reduced-sodium soy sauce')],
    steps: ['Beat eggs. Heat half the oil and scramble eggs until firm and 160 F (71 C); transfer to a clean plate.', 'Dice tomatoes and cook in remaining oil for 5 minutes. Add spinach and soy sauce.', 'Return eggs to the pan and heat through. Serve over rice reheated until steaming hot.'],
  },
  {
    id: 'chinese-ginger-chicken-broccoli', title: 'Ginger chicken broccoli rice', meal: 'Lunch', cuisine: 'Chinese', description: 'A quick skillet with a light ginger soy finish.',
    servings: 2, prepMinutes: 12, cookMinutes: 18,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('broccoli', 300, 'broccoli'), portion('brownRice', 300, 'cooked brown rice'), portion('carrot', 120, 'carrot'), portion('ginger', 15, 'fresh ginger'), portion('garlic', 8, 'garlic'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 14, 'reduced-sodium soy sauce')],
    steps: ['Slice chicken on a separate board; cut vegetables thinly and mince ginger and garlic.', 'Cook chicken in oil for 7 minutes, turning. Add broccoli, carrot, ginger, garlic and 60 ml water.', 'Cover and cook until vegetables are tender and chicken reaches 165 F (74 C). Stir in soy sauce and serve with steaming rice.'],
  },
  {
    id: 'chinese-tofu-cabbage-wraps', title: 'Tofu cabbage lettuce cups', meal: 'Lunch', cuisine: 'Chinese', description: 'Warm crumbled tofu with crunchy lettuce and rice.',
    servings: 2, prepMinutes: 12, cookMinutes: 15,
    ingredients: [portion('tofu', 300, 'firm calcium-set tofu, drained'), portion('cabbage', 180, 'cabbage'), portion('mushrooms', 150, 'white mushrooms'), portion('lettuce', 160, 'romaine lettuce'), portion('brownRice', 260, 'cooked brown rice'), portion('ginger', 10, 'fresh ginger'), portion('oliveOil', 8, 'olive oil'), portion('soySauce', 12, 'reduced-sodium soy sauce')],
    steps: ['Crumble tofu and finely chop cabbage, mushrooms and ginger.', 'Cook tofu and mushrooms in oil for 8 minutes. Add cabbage, ginger, soy sauce and a splash of water; cook for 7 minutes until tender and hot.', 'Spoon into washed lettuce leaves and serve with hot rice alongside.'],
  },
  {
    id: 'chinese-sesame-tofu-broccoli', title: 'Sesame tofu broccoli skillet', meal: 'Dinner', cuisine: 'Chinese', description: 'Browning tofu adds texture without deep frying.',
    servings: 2, prepMinutes: 12, cookMinutes: 20,
    ingredients: [portion('tofu', 320, 'firm calcium-set tofu, drained'), portion('broccoli', 300, 'broccoli'), portion('bellPepper', 180, 'red bell pepper'), portion('brownRice', 300, 'cooked brown rice'), portion('sesame', 12, 'sesame seeds'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 14, 'reduced-sodium soy sauce'), portion('ginger', 12, 'fresh ginger')],
    steps: ['Pat tofu dry and cube. Cut vegetables into bite-size pieces.', 'Brown tofu in oil for 10 minutes, turning. Add vegetables, grated ginger and 60 ml water; cover and cook for 7 minutes.', 'Add soy sauce and sesame seeds, stir until hot and serve over steaming rice.'],
  },
  {
    id: 'chinese-salmon-ginger-steam', title: 'Ginger salmon with cabbage', meal: 'Dinner', cuisine: 'Chinese', description: 'Gently steamed fish with a measured soy dressing.',
    servings: 2, prepMinutes: 12, cookMinutes: 20,
    ingredients: [portion('salmon', 300, 'raw boneless salmon'), portion('cabbage', 300, 'cabbage'), portion('carrot', 150, 'carrot'), portion('brownRice', 300, 'cooked brown rice'), portion('ginger', 20, 'fresh ginger'), portion('soySauce', 12, 'reduced-sodium soy sauce'), portion('lime', 20, 'lime juice'), portion('sesame', 8, 'sesame seeds')],
    steps: ['Slice cabbage, carrot and ginger. Place in a steamer and steam for 5 minutes.', 'Add salmon on a heatproof plate; steam covered until fish reaches 145 F (63 C), about 12-15 minutes.', 'Mix soy sauce and lime juice. Check fish for bones, drizzle with dressing and sesame seeds, and serve with vegetables and hot rice.'],
  },
  {
    id: 'chinese-sesame-cucumber-edamame', title: 'Sesame cucumber edamame snack', meal: 'Snack', cuisine: 'Chinese', description: 'A chilled crunchy bowl with ready-cooked soybeans.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('edamame', 180, 'cooked shelled edamame, cooled'), portion('cucumber', 220, 'cucumber with peel'), portion('sesame', 8, 'sesame seeds'), portion('vinegar', 15, 'cider vinegar'), portion('soySauce', 6, 'reduced-sodium soy sauce')],
    steps: ['Use edamame cooked according to its package directions, weighed after shelling and cooking. Cooking time is not included for this ready-cooked ingredient.', 'Cut cucumber into chunks and toss with cooled edamame, vinegar, soy sauce and sesame seeds. Keep chilled.'],
  },
  {
    id: 'japanese-spinach-egg-rice', title: 'Spinach sesame egg rice', meal: 'Breakfast', cuisine: 'Japanese', description: 'A simple rice breakfast with cooked egg and greens.',
    servings: 2, prepMinutes: 8, cookMinutes: 12,
    ingredients: [portion('egg', 200, 'egg without shells'), portion('spinach', 150, 'spinach'), portion('brownRice', 280, 'cooked brown rice'), portion('sesame', 8, 'sesame seeds'), portion('oliveOil', 6, 'olive oil'), portion('soySauce', 8, 'reduced-sodium soy sauce')],
    steps: ['Warm oil in a skillet and wilt spinach. Add beaten eggs and stir until firm and 160 F (71 C).', 'Reheat rice until steaming throughout. Divide between bowls, top with eggs and finish with soy sauce and sesame seeds.'],
  },
  {
    id: 'japanese-salmon-cucumber-bowl', title: 'Cooked salmon cucumber bowl', meal: 'Lunch', cuisine: 'Japanese', description: 'A sushi-inspired rice bowl made with fully cooked fish.',
    servings: 2, prepMinutes: 12, cookMinutes: 18,
    ingredients: [portion('salmon', 260, 'raw boneless salmon'), portion('brownRice', 300, 'cooked brown rice'), portion('cucumber', 220, 'cucumber with peel'), portion('carrot', 120, 'carrot'), portion('avocado', 80, 'avocado flesh'), portion('vinegar', 20, 'cider vinegar'), portion('soySauce', 10, 'reduced-sodium soy sauce'), portion('sesame', 8, 'sesame seeds')],
    steps: ['Heat oven to 400 F (200 C). Bake salmon on parchment for about 18 minutes until it reaches 145 F (63 C).', 'Slice cucumber, grate carrot and dice avocado. Stir vinegar into hot rice.', 'Top rice with vegetables and cooked boneless salmon flakes. Add measured soy sauce and sesame seeds.'],
  },
  {
    id: 'japanese-edamame-rice-salad', title: 'Edamame sesame rice salad', meal: 'Lunch', cuisine: 'Japanese', description: 'A vegetable-heavy rice salad for a chilled lunch.',
    servings: 2, prepMinutes: 15, cookMinutes: 0,
    ingredients: [portion('edamame', 260, 'cooked shelled edamame, cooled'), portion('brownRice', 300, 'cooked brown rice, safely cooled'), portion('cucumber', 200, 'cucumber with peel'), portion('carrot', 150, 'carrot'), portion('sesame', 12, 'sesame seeds'), portion('vinegar', 25, 'cider vinegar'), portion('soySauce', 12, 'reduced-sodium soy sauce')],
    steps: ['Use edamame cooked according to package directions and weighed after cooking, and rice that was cooled promptly and refrigerated. Advance cooking is not included.', 'Dice cucumber and grate carrot. Toss all ingredients together and keep chilled until serving.'],
  },
  {
    id: 'japanese-ginger-chicken-bowl', title: 'Ginger chicken cabbage rice', meal: 'Dinner', cuisine: 'Japanese', description: 'A ginger-forward skillet without a sugary glaze.',
    servings: 2, prepMinutes: 12, cookMinutes: 20,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('cabbage', 260, 'cabbage'), portion('mushrooms', 180, 'white mushrooms'), portion('brownRice', 300, 'cooked brown rice'), portion('ginger', 20, 'fresh ginger'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 14, 'reduced-sodium soy sauce'), portion('vinegar', 15, 'cider vinegar')],
    steps: ['Slice chicken separately from vegetables. Grate ginger.', 'Brown chicken in oil for 7 minutes. Add sliced cabbage, mushrooms, ginger and 60 ml water; cover and cook for 10 minutes.', 'Check chicken reaches 165 F (74 C). Add soy sauce and vinegar, heat through and serve over steaming rice.'],
  },
  {
    id: 'japanese-tofu-mushroom-bowl', title: 'Tofu mushroom sesame bowl', meal: 'Dinner', cuisine: 'Japanese', description: 'A hearty tofu bowl with mushrooms and green beans.',
    servings: 2, prepMinutes: 12, cookMinutes: 20,
    ingredients: [portion('tofu', 320, 'firm calcium-set tofu, drained'), portion('mushrooms', 250, 'white mushrooms'), portion('greenBeans', 220, 'green beans'), portion('brownRice', 300, 'cooked brown rice'), portion('sesame', 12, 'sesame seeds'), portion('oliveOil', 8, 'olive oil'), portion('soySauce', 12, 'reduced-sodium soy sauce'), portion('ginger', 12, 'fresh ginger')],
    steps: ['Cube dry tofu, slice mushrooms and trim beans.', 'Brown tofu in oil for 8 minutes. Add mushrooms, beans, ginger and 80 ml water; cover and simmer for 10 minutes until beans are tender.', 'Stir in soy sauce and sesame seeds. Serve over steaming rice.'],
  },
  {
    id: 'japanese-edamame-carrot-cups', title: 'Lemon sesame edamame cups', meal: 'Snack', cuisine: 'Japanese', description: 'A small protein-rich vegetable snack.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('edamame', 200, 'cooked shelled edamame, cooled'), portion('carrot', 120, 'carrot'), portion('cucumber', 160, 'cucumber with peel'), portion('lemon', 20, 'lemon juice'), portion('sesame', 10, 'sesame seeds')],
    steps: ['Use shelled edamame cooked according to package directions and weighed after cooking. Advance cooking is not included.', 'Grate carrot and dice cucumber. Mix with cooled edamame, lemon juice and sesame seeds; divide into cups and keep chilled.'],
  },
  {
    id: 'thai-pineapple-breakfast-oats', title: 'Pineapple lime breakfast oats', meal: 'Breakfast', cuisine: 'Thai', description: 'A tropical overnight bowl with yogurt and lime.',
    servings: 1, prepMinutes: 8, cookMinutes: 0,
    ingredients: [portion('oats', 45, 'rolled oats'), portion('yogurt', 170, 'plain nonfat Greek yogurt'), portion('milk', 120, 'skim milk'), portion('pineapple', 120, 'fresh pineapple flesh'), portion('lime', 8, 'lime juice'), portion('pumpkinSeeds', 10, 'unsalted pumpkin seeds')],
    steps: ['Mix oats, yogurt, milk and lime juice. Cover and chill for at least 4 hours; prep time excludes chilling.', 'Dice pineapple and spoon on top with pumpkin seeds before serving.'],
  },
  {
    id: 'thai-lime-chicken-salad', title: 'Lime chicken cabbage salad', meal: 'Lunch', cuisine: 'Thai', description: 'Crunchy cabbage with lime, ginger and cooked chicken.',
    servings: 2, prepMinutes: 15, cookMinutes: 18,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('cabbage', 250, 'cabbage'), portion('carrot', 120, 'carrot'), portion('brownRice', 280, 'cooked brown rice'), portion('lime', 35, 'lime juice'), portion('ginger', 12, 'fresh ginger'), portion('cilantro', 15, 'fresh cilantro'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 10, 'reduced-sodium soy sauce')],
    steps: ['Slice chicken on a separate board. Cook in half the oil, turning, until it reaches 165 F (74 C), about 12-18 minutes.', 'Shred cabbage and carrot. Mix lime juice, grated ginger, soy sauce and remaining oil.', 'Toss vegetables and cooked chicken with dressing and cilantro. Serve with steaming rice.'],
  },
  {
    id: 'thai-peanut-tofu-rice', title: 'Peanut lime tofu rice bowl', meal: 'Lunch', cuisine: 'Thai', description: 'A measured peanut sauce with tofu and vegetables.',
    servings: 2, prepMinutes: 12, cookMinutes: 18,
    ingredients: [portion('tofu', 300, 'firm calcium-set tofu, drained'), portion('brownRice', 300, 'cooked brown rice'), portion('cucumber', 200, 'cucumber with peel'), portion('carrot', 150, 'carrot'), portion('peanutButter', 24, 'unsalted peanut butter'), portion('lime', 30, 'lime juice'), portion('soySauce', 10, 'reduced-sodium soy sauce'), portion('oliveOil', 8, 'olive oil')],
    steps: ['Cube tofu and brown in oil for 12-15 minutes, turning.', 'Whisk peanut butter, lime juice and soy sauce with warm water a spoonful at a time to make a pourable sauce.', 'Slice cucumber and grate carrot. Serve with hot rice and tofu; drizzle measured sauce over both bowls.'],
  },
  {
    id: 'thai-ginger-chicken-pot', title: 'Ginger lime chicken vegetable pot', meal: 'Dinner', cuisine: 'Thai', description: 'A light broth-style dinner without a coconut cream base.',
    servings: 2, prepMinutes: 12, cookMinutes: 25,
    ingredients: [portion('chicken', 300, 'raw skinless boneless chicken breast'), portion('mushrooms', 200, 'white mushrooms'), portion('bellPepper', 180, 'red bell pepper'), portion('spinach', 100, 'spinach'), portion('brownRice', 300, 'cooked brown rice'), portion('ginger', 20, 'fresh ginger'), portion('lime', 30, 'lime juice'), portion('oliveOil', 8, 'olive oil'), portion('soySauce', 12, 'reduced-sodium soy sauce')],
    steps: ['Slice chicken on a separate board. Warm oil in a pot and cook chicken with sliced ginger for 5 minutes.', 'Add sliced mushrooms, pepper and 500 ml water. Simmer for 15 minutes, until chicken reaches 165 F (74 C).', 'Add spinach and soy sauce; heat until wilted. Finish with lime juice and serve alongside steaming rice.'],
  },
  {
    id: 'thai-pineapple-tofu-skillet', title: 'Pineapple tofu vegetable skillet', meal: 'Dinner', cuisine: 'Thai', description: 'Fresh pineapple adds sweetness without a bottled glaze.',
    servings: 2, prepMinutes: 15, cookMinutes: 20,
    ingredients: [portion('tofu', 320, 'firm calcium-set tofu, drained'), portion('pineapple', 180, 'fresh pineapple flesh'), portion('bellPepper', 220, 'red bell pepper'), portion('broccoli', 250, 'broccoli'), portion('brownRice', 280, 'cooked brown rice'), portion('oliveOil', 10, 'olive oil'), portion('soySauce', 12, 'reduced-sodium soy sauce'), portion('lime', 20, 'lime juice'), portion('ginger', 12, 'fresh ginger')],
    steps: ['Dry and cube tofu. Cut pineapple and vegetables into bite-size pieces.', 'Brown tofu in oil for 10 minutes. Add broccoli, pepper, ginger and 60 ml water; cover and cook for 7 minutes.', 'Stir in pineapple, soy sauce and lime juice. Heat for 3 minutes and serve over steaming rice.'],
  },
  {
    id: 'thai-lime-peanut-cucumber', title: 'Lime peanut cucumber cups', meal: 'Snack', cuisine: 'Thai', description: 'Crunchy vegetables with a small peanut lime dip.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('peanutButter', 30, 'unsalted peanut butter'), portion('yogurt', 120, 'plain nonfat Greek yogurt'), portion('lime', 20, 'lime juice'), portion('cucumber', 220, 'cucumber with peel'), portion('carrot', 150, 'carrot')],
    steps: ['Stir peanut butter, yogurt and lime juice until smooth.', 'Cut cucumber and carrot into sticks. Divide dip into cups and serve with the vegetables; keep chilled.'],
  },
  {
    id: 'middle-eastern-tomato-eggs', title: 'Tomato chickpea breakfast eggs', meal: 'Breakfast', cuisine: 'Middle Eastern', description: 'A shakshuka-inspired skillet with chickpeas.',
    servings: 2, prepMinutes: 10, cookMinutes: 20,
    ingredients: [portion('egg', 200, 'egg without shells'), portion('chickpeas', 180, 'cooked chickpeas without salt'), portion('cannedTomato', 300, 'canned crushed tomatoes'), portion('bellPepper', 150, 'red bell pepper'), portion('onion', 80, 'onion'), portion('oliveOil', 8, 'olive oil'), portion('cumin', 2, 'ground cumin')],
    steps: ['Dice onion and pepper. Soften in oil for 7 minutes with cumin.', 'Add tomatoes and chickpeas; simmer for 5 minutes.', 'Make spaces for eggs. Add eggs, cover and cook gently until firm and 160 F (71 C).'],
  },
  {
    id: 'middle-eastern-chickpea-parsley-salad', title: 'Chickpea parsley bulgur salad', meal: 'Lunch', cuisine: 'Middle Eastern', description: 'A tabbouleh-inspired lunch with extra chickpeas.',
    servings: 2, prepMinutes: 15, cookMinutes: 0,
    ingredients: [portion('bulgur', 300, 'cooked bulgur without salt, cooled'), portion('chickpeas', 240, 'cooked chickpeas without salt'), portion('parsley', 40, 'fresh parsley'), portion('tomato', 220, 'tomato'), portion('cucumber', 200, 'cucumber with peel'), portion('lemon', 35, 'lemon juice'), portion('oliveOil', 12, 'olive oil')],
    steps: ['Use safely cooled, refrigerated bulgur. Finely chop parsley, tomato and cucumber.', 'Toss with chickpeas, bulgur, lemon juice and oil. Divide into two bowls and keep chilled.'],
  },
  {
    id: 'middle-eastern-chicken-pita', title: 'Cumin chicken yogurt pita', meal: 'Lunch', cuisine: 'Middle Eastern', description: 'A shawarma-inspired pita with simple pantry spices.',
    servings: 2, prepMinutes: 15, cookMinutes: 18,
    ingredients: [portion('chicken', 280, 'raw skinless boneless chicken breast'), portion('pita', 120, 'whole-wheat pita'), portion('cucumber', 180, 'cucumber with peel'), portion('tomato', 180, 'tomato'), portion('yogurt', 100, 'plain nonfat Greek yogurt'), portion('lemon', 25, 'lemon juice'), portion('oliveOil', 8, 'olive oil'), portion('cumin', 3, 'ground cumin'), portion('garlic', 6, 'garlic')],
    steps: ['Slice chicken on a separate board. Cook in oil with cumin and half the minced garlic, turning, until it reaches 165 F (74 C), about 12-18 minutes.', 'Mix yogurt, lemon juice and remaining garlic. Slice cucumber and tomato.', 'Warm pita and fill with cooked chicken, vegetables and yogurt sauce.'],
  },
  {
    id: 'middle-eastern-lentil-bulgur-pot', title: 'Lentil onion bulgur pot', meal: 'Dinner', cuisine: 'Middle Eastern', description: 'A mujadara-inspired bowl using cooked lentils and bulgur.',
    servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredients: [portion('lentils', 320, 'cooked lentils without salt'), portion('bulgur', 300, 'cooked bulgur without salt'), portion('onion', 220, 'onion'), portion('tomato', 220, 'tomato'), portion('cucumber', 180, 'cucumber with peel'), portion('oliveOil', 14, 'olive oil'), portion('cumin', 3, 'ground cumin'), portion('lemon', 25, 'lemon juice')],
    steps: ['Thinly slice onion. Cook in oil over medium-low heat for 20 minutes, stirring and adding a splash of water if it sticks.', 'Add lentils, bulgur, cumin and 60 ml water. Stir until steaming throughout.', 'Dice cucumber and tomato and toss with lemon juice. Serve beside the hot lentil bowl.'],
  },
  {
    id: 'middle-eastern-chickpea-cauliflower', title: 'Roasted cauliflower chickpea bowls', meal: 'Dinner', cuisine: 'Middle Eastern', description: 'Warm roasted vegetables with a measured tahini dressing.',
    servings: 2, prepMinutes: 12, cookMinutes: 30,
    ingredients: [portion('cauliflower', 400, 'cauliflower'), portion('chickpeas', 280, 'cooked chickpeas without salt, drained'), portion('bulgur', 280, 'cooked bulgur without salt'), portion('tahini', 24, 'unsalted tahini'), portion('lemon', 30, 'lemon juice'), portion('oliveOil', 10, 'olive oil'), portion('cumin', 3, 'ground cumin'), portion('parsley', 15, 'fresh parsley')],
    steps: ['Heat oven to 425 F (220 C). Break cauliflower into small florets and toss with chickpeas, oil and cumin.', 'Roast for 25-30 minutes, turning once, until cauliflower is tender.', 'Whisk tahini and lemon juice with warm water until pourable. Serve vegetables over steaming bulgur, drizzle with dressing and add chopped parsley.'],
  },
  {
    id: 'middle-eastern-white-bean-dip', title: 'Lemon tahini white bean dip', meal: 'Snack', cuisine: 'Middle Eastern', description: 'A creamy bean dip with crunchy vegetables.',
    servings: 2, prepMinutes: 10, cookMinutes: 0,
    ingredients: [portion('whiteBeans', 200, 'cooked white beans without salt'), portion('tahini', 15, 'unsalted tahini'), portion('lemon', 25, 'lemon juice'), portion('garlic', 3, 'garlic'), portion('carrot', 150, 'carrot'), portion('cucumber', 180, 'cucumber with peel')],
    steps: ['Mash or blend beans, tahini, lemon juice and finely grated garlic with a little water until smooth.', 'Cut carrot and cucumber into sticks. Divide dip into two bowls and serve with the vegetables. Keep chilled.'],
  },
];

export function filterLibraryRecipes(filters: { meal?: RecipeMealType | null; cuisine?: RecipeCuisine | null; search?: string }): StarterRecipe[] {
  const terms = (filters.search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return STARTER_RECIPES.filter((recipe) => {
    if (filters.meal && recipe.meal !== filters.meal) return false;
    if (filters.cuisine && recipe.cuisine !== filters.cuisine) return false;
    const text = `${recipe.title} ${recipe.description} ${recipe.cuisine} ${recipe.meal} ${recipe.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function starterRecipeDraft(recipe: StarterRecipe): RecipeDraft {
  return {
    ...emptyDraft(), title: recipe.title, servings: recipe.servings,
    prepMinutes: recipe.prepMinutes, cookMinutes: recipe.cookMinutes, sourceName: `Buko starter library - ${recipe.cuisine}-inspired`,
    ingredients: recipe.ingredients.map((ingredient, position) => {
      const food = LIBRARY_FOODS[ingredient.food];
      return {
        ...draftFromText(libraryIngredientText(ingredient), position),
        grams: ingredient.grams, food_source: 'usda', food_source_id: food.fdcId,
        nutrition: { per100g: { ...food.per100g }, category: food.category }, match_status: 'matched',
      };
    }),
    steps: recipe.steps.map((text, position) => ({ position, text, timer_seconds: detectTimerSeconds(text) })),
  };
}

export function libraryRecipeSummary(recipe: StarterRecipe) {
  const draft = starterRecipeDraft(recipe);
  const nutrition = computeRecipeNutrition(draft.ingredients, recipe.servings);
  return { nutrition, result: scoreRecipe(recipe.title, nutrition) };
}
