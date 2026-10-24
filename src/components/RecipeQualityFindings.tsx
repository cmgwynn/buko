import { checkRecipe } from '../lib/recipes/quality/checks';
import type { CuratedRecipe } from '../lib/recipes/qualityClient';
import { Notice } from './ui';

export function RecipeQualityFindings({ recipe }: { recipe: CuratedRecipe }) {
  const result = checkRecipe(recipe, { weeknight: true, dietTags: recipe.dietTags, excludedIngredients: [] });
  return <>{result.issues.map((issue, index) => <Notice key={`${issue.category}:${index}`} tone={issue.severity === 'blocking' ? 'danger' : 'info'}>
    {issue.severity === 'blocking' ? 'Resolve before approval' : 'Cooking-test review'}: {issue.detail}
  </Notice>)}</>;
}
