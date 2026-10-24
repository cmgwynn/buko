import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { loadQualityProvenance, type QualityProvenance } from '../lib/recipes/qualityClient';
import { Notice } from './ui';
import { typography } from '../theme';

export function RecipeQualityLabel({ recipeId }: { recipeId: string }) {
  const [value, setValue] = useState<QualityProvenance | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setValue(null); setError(null);
    loadQualityProvenance(recipeId).then((result) => { if (live) setValue(result); })
      .catch((e: Error) => { if (live) setError(`Recipe testing label unavailable: ${e.message}`); });
    return () => { live = false; };
  }, [recipeId]);
  return error ? <Notice tone="info">{error}</Notice> : value?.label ? <>
    <Text style={typography.subheading}>{value.label}{value.baseTitle ? ` · Based on ${value.baseTitle}` : ''}</Text>
    {value.note ? <Text style={typography.small}>{value.note}</Text> : null}
  </> : null;
}
