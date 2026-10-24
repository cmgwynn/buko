import type { RecipeCuisine } from './library';

interface CuisineReference {
  context: string;
  links: { title: string; url: string }[];
}

export const CUISINE_REFERENCES: Record<RecipeCuisine, CuisineReference> = {
  Italian: {
    context: 'Italian cooking is regional. These original Buko formulations include whole-grain and ready-cooked-bean adaptations; they are not reproductions of the reference recipes.',
    links: [{ title: 'GialloZafferano: pasta e ceci and its variations', url: 'https://ricette.giallozafferano.it/Pasta-e-ceci.html' }],
  },
  Mexican: {
    context: 'Mexican cuisines are diverse. Tomato, onion and fresh chile define a la mexicana preparations. Tex-Mex and whole-wheat tortilla adaptations are identified separately.',
    links: [{ title: 'Mely Martinez: a la mexicana cooking', url: 'https://www.mexicoinmykitchen.com/nopales-easy-mexican-recipe/' }],
  },
  American: {
    context: 'These are contemporary American home-cooking combinations, not a survey of Indigenous, regional or immigrant food traditions. A higher score does not make a cuisine or traditional dish inferior.',
    links: [{ title: 'USDA MyPlate: varied food groups and recipe ideas', url: 'https://www.myplate.gov/recipes' }],
  },
  Filipino: {
    context: 'Filipino dishes vary by household and region. Vinegar-garlic adobo, ginger-based tinola and munggo have different identities. Ingredient changes and shorter breast-meat cooking times are stated.',
    links: [
      { title: 'Vanjo Merano: chicken adobo', url: 'https://panlasangpinoy.com/filipino-chicken-adobo-recipe/' },
      { title: 'Vanjo Merano: tinola', url: 'https://panlasangpinoy.com/filipino-chicken-tinola-recipe/' },
      { title: 'Vanjo Merano: ginisang munggo', url: 'https://panlasangpinoy.com/ginisang-munggo-sauteed-mung-beans/' },
    ],
  },
  Mediterranean: {
    context: 'Mediterranean is a broad regional collection, not one national cuisine. Specific Greek and Spanish references are named where applicable; other entries are descriptive ingredient combinations.',
    links: [{ title: 'Suzy Karadsheh: regional recipes and cooking context', url: 'https://www.themediterraneandish.com/recipes/' }],
  },
  Indian: {
    context: 'Indian cuisines differ substantially by region. Whole brown lentils are not interchangeable with split dal, and a short pantry-spice list is not a full regional masala. These changes are disclosed.',
    links: [
      { title: 'Swasthi: palak dal and lentil choices', url: 'https://www.indianhealthyrecipes.com/palak-dal-recipe-spinach-dal/' },
      { title: 'Swasthi: khichdi', url: 'https://www.indianhealthyrecipes.com/khichdi-recipe/' },
    ],
  },
  Chinese: {
    context: 'Chinese cuisines are regional. These dishes use techniques such as steaming, tomato-and-egg stir-frying and cucumber dressing; vinegar, mushroom and rice substitutions are identified rather than silently treated as equivalent.',
    links: [{ title: 'The Woks of Life: tomato and egg stir-fry', url: 'https://thewoksoflife.com/stir-fried-tomato-and-egg/' }],
  },
  Japanese: {
    context: 'Sesame dressing, donburi and steamed or parcel-cooked fish are distinct preparations. Brown rice, firm tofu, vinegar substitutions and omitted dashi or mirin are noted; these are not claims of classic sushi or oyakodon.',
    links: [
      { title: 'Namiko Chen: goma-ae technique', url: 'https://www.justonecookbook.com/spinach-with-sesame-sauce/' },
      { title: 'Namiko Chen: oyakodon', url: 'https://www.justonecookbook.com/oyakodon/' },
    ],
  },
  Thai: {
    context: 'Thai dishes have regional identities. Northeastern Thai laab shares a food tradition with Lao cooking and uses toasted rice and herbs. Sweet basil is not holy basil; peanut butter or tropical fruit alone does not make a recipe Thai.',
    links: [
      { title: 'Pailin Chongchitnant: laab gai and toasted rice', url: 'https://hot-thai-kitchen.com/laab-gai/' },
      { title: 'Pailin Chongchitnant: holy basil stir-fry', url: 'https://hot-thai-kitchen.com/holy-basil-stir-fry/' },
    ],
  },
  'Middle Eastern': {
    context: 'This is a broad regional collection, not one cuisine. Tabbouleh is parsley-led and Levantine; mujaddara combines lentils, grain and browned onions. Shakshuka has North African roots and is also widely cooked in the Middle East.',
    links: [
      { title: 'Suzy Karadsheh: tabbouleh and parsley', url: 'https://www.themediterraneandish.com/tabouli-salad/' },
      { title: 'Suzy Karadsheh: mujaddara', url: 'https://www.themediterraneandish.com/mujadara-lentils-and-rice-with-crispy-onions/' },
      { title: 'Suzy Karadsheh: shakshuka', url: 'https://www.themediterraneandish.com/shakshuka-recipe/' },
    ],
  },
  Everyday: {
    context: 'General Buko combinations without a specific cultural claim. Fruit, peanut butter, soy sauce or a single spice does not establish a dish as belonging to one cuisine. The linked source is for nutrition, not recipe authorship.',
    links: [{ title: 'USDA FoodData Central: nutrition data', url: 'https://fdc.nal.usda.gov/' }],
  },
};
