import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { isRecipeAdmin } from '../lib/recipes/qualityClient';
import { Button, Notice } from './ui';
import { useAuth } from '../providers/AuthProvider';

export function RecipeAdminLink() {
  const router = useRouter();
  const { session } = useAuth();
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true; setAdmin(false);
    isRecipeAdmin().then((value) => { if (live) { setAdmin(value); setError(null); } })
      .catch((e: Error) => { if (live) setError(`Recipe admin access could not be checked: ${e.message}`); });
    return () => { live = false; };
  }, [session?.user.id]));
  return error ? <Notice tone="info">{error}</Notice> : admin ? <Button title="Admin: Recipe quality" variant="secondary" onPress={() => router.push('/recipe/admin')} /> : null;
}
