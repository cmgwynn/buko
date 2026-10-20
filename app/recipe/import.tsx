import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Card, Notice, Screen, TextField } from '../../src/components/ui';
import { setDraft } from '../../src/lib/recipes/draft';
import { importRecipeFromUrl } from '../../src/lib/recipes/importer';
import { draftFromText } from '../../src/lib/recipes/matching';
import { detectTimerSeconds } from '../../src/lib/recipes/timers';
import { spacing } from '../../src/theme';

export default function ImportRecipe() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await importRecipeFromUrl(url);
      setDraft({
        title: r.title,
        servings: r.servings ?? 4,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        sourceUrl: r.sourceUrl,
        sourceName: r.sourceName,
        photoPath: null,
        photoUri: null,
        ingredients: r.ingredients.map((t, i) => draftFromText(t, i)),
        steps: r.steps.map((text, i) => ({ position: i, text, timer_seconds: detectTimerSeconds(text) })),
      });
      router.replace('/recipe/edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that page.');
      setBusy(false);
    }
  }

  return (
    <Screen edges={[]}>
      <TextField label="Recipe web address" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={run} />
      <Button title="Import recipe" onPress={run} loading={busy} disabled={!url.trim()} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card style={{ marginTop: spacing.lg }}>
        <Body muted>
          Buko reads the structured recipe data a site publishes for apps: title, ingredients, steps, servings and times. It does not copy descriptions, stories or photos, and the original link is always saved and shown with the recipe. The page is fetched directly from your phone; nothing about you is sent.
        </Body>
      </Card>
    </Screen>
  );
}
