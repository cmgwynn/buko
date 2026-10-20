import type { Section } from './types';

const RULES: [Section, RegExp][] = [
  ['frozen', /\bfrozen\b|\bice cream\b/],
  ['meat', /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|mince|ground (beef|turkey|pork|chicken)|salmon|tuna|cod|shrimp|prawn|fish|fillet|anchov|duck|veal|prosciutto|chorizo)/],
  ['dairy', /\b(milk|cream|butter|cheese|yogurt|yoghurt|egg|eggs|parmesan|mozzarella|cheddar|feta|ricotta|buttermilk|ghee|sour cream|mascarpone)\b/],
  ['produce', /\b(onion|garlic|tomato|potato|carrot|lettuce|spinach|kale|pepper|cucumber|zucchini|courgette|broccoli|cauliflower|celery|mushroom|lemon|lime|orange|apple|banana|berry|berries|avocado|basil|parsley|cilantro|coriander|mint|thyme|rosemary|dill|chive|scallion|ginger|cabbage|squash|pumpkin|eggplant|aubergine|leek|shallot|herb|arugula|rocket|beet|radish|corn|pea|peas|bean sprout|grape|mango|pineapple|peach|pear|plum|melon|asparagus|jalapeno|chili|chilli|fennel|salad)/],
];

/** Store section for a grocery item; unknown items default to pantry staples. */
export function sectionFor(name: string): Section {
  const n = name.toLowerCase();
  // Tinned/dried versions are pantry goods even if they share a word with produce ("canned tomatoes").
  if (/\b(canned|tinned|dried|powder|paste|sauce|stock|broth|extract|flour|sugar|oil|vinegar|spice|salt|pasta|rice|noodle|bread crumb|breadcrumb|oats|lentil|chickpea|bean|honey|syrup|cocoa|baking|yeast|nuts?|peanuts?|almond|walnut|seed|cereal|cracker|tortilla|bread|stock cube)\b/.test(n)) {
    if (!/\b(green bean|bean sprout)\b/.test(n)) return 'pantry';
  }
  for (const [section, re] of RULES) if (re.test(n)) return section;
  return 'pantry';
}

/** Lower-case, singular-ish key so "Onions" and "onion" merge. */
export function canonicalName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\b(fresh|large|small|medium|chopped|diced|minced|sliced|ripe|finely|roughly|big|extra|virgin|organic|boneless|skinless|whole)\b/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n
    .split(' ')
    .map(singular)
    .join(' ');
}

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(tomatoes|potatoes|mangoes|avocadoes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}
