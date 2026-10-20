import type { Units } from '../../types';
import { displayAmount, resolveUnit, scaleQuantity, type Dimension } from './units';
import { canonicalName, sectionFor } from './sections';
import type { PantryItem, Section } from './types';

export interface PlannedRecipe {
  title: string;
  servings: number;
  /** Total servings planned across the selected range. */
  plannedServings: number;
  ingredients: { name: string; quantity: number | null; unit: string | null; section?: Section }[];
}

export interface GeneratedItem {
  name: string;
  section: Section;
  dim: Dimension;
  /** Base amount: grams, millilitres, or a count. Null for unmeasured items ("salt to taste"). */
  amount: number | null;
  /** Base unit label ("g", "ml") or the count unit ("clove"). */
  baseUnit: string;
  /** Friendly text, e.g. "1.5 kg" or "3 cloves". */
  display: string;
  fromRecipes: string[];
}

interface Bucket {
  key: string;
  name: string;
  section: Section;
  dim: Dimension;
  countUnit: string;
  amount: number | null;
  recipes: Set<string>;
}

const pantryKey = (p: PantryItem) => p.canonical_name;

/**
 * Combine ingredients across recipes into a shopping list.
 *
 * - Duplicates merge by name, but only within the same dimension (weight / volume / count).
 * - Pantry items are subtracted: an item with no quantity means "I have plenty" and removes the
 *   line completely; an item with a quantity in the same dimension is subtracted from it.
 * - Quantities are shown in the user's unit system.
 */
export function buildGroceryList(recipes: PlannedRecipe[], pantry: PantryItem[], system: Units): GeneratedItem[] {
  const buckets = new Map<string, Bucket>();

  for (const r of recipes) {
    for (const ing of r.ingredients) {
      const key = canonicalName(ing.name);
      if (!key) continue;
      const u = resolveUnit(ing.unit);
      const scaled = scaleQuantity(ing.quantity, r.servings, r.plannedServings);
      const base = scaled === null ? null : scaled * u.factor;
      const hasAmount = base !== null;
      // Unmeasured items ("salt to taste") get their own bucket so they never inflate a measured one.
      const bucketKey = `${key}|${hasAmount ? u.dim : 'none'}|${hasAmount && u.dim === 'count' ? u.canonical : ''}`;
      let b = buckets.get(bucketKey);
      if (!b) {
        b = {
          key,
          name: key,
          section: ing.section ?? sectionFor(ing.name),
          dim: hasAmount ? u.dim : 'count',
          countUnit: hasAmount && u.dim === 'count' ? u.canonical : '',
          amount: hasAmount ? 0 : null,
          recipes: new Set(),
        };
        b.name = ing.name.trim();
        buckets.set(bucketKey, b);
      }
      if (hasAmount && b.amount !== null) b.amount += base as number;
      b.recipes.add(r.title);
    }
  }

  const pantryByKey = new Map(pantry.map((p) => [pantryKey(p), p]));
  const out: GeneratedItem[] = [];

  for (const b of buckets.values()) {
    const have = pantryByKey.get(b.key);
    let amount = b.amount;
    if (have) {
      if (have.quantity === null) continue; // marked as "have it", no amount tracked
      const hu = resolveUnit(have.unit);
      if (amount === null) continue;
      if (hu.dim === b.dim) {
        amount -= have.quantity * hu.factor;
        if (amount <= 0.0001) continue;
      }
    }
    const name = b.name.charAt(0).toUpperCase() + b.name.slice(1);
    if (amount === null) {
      out.push({ name, section: b.section, dim: b.dim, amount: null, baseUnit: '', display: '', fromRecipes: [...b.recipes] });
      continue;
    }
    const d = displayAmount(b.dim, amount, b.countUnit, system);
    out.push({
      name,
      section: b.section,
      dim: b.dim,
      amount,
      baseUnit: b.dim === 'mass' ? 'g' : b.dim === 'volume' ? 'ml' : b.countUnit,
      display: d.text,
      fromRecipes: [...b.recipes],
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
