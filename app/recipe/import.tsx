import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { SavedPageImport } from '../../src/components/SavedPageImport';
import { Body, Button, Card, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { config } from '../../src/lib/config';
import { setDraft } from '../../src/lib/recipes/draft';
import { importRecipeFromHtml, importRecipeFromUrl, importRecipeViaBackend } from '../../src/lib/recipes/importer';
import type { ParsedRecipe } from '../../src/lib/recipes/schemaOrg';
import { draftFromText } from '../../src/lib/recipes/matching';
import { detectTimerSeconds } from '../../src/lib/recipes/timers';
import { spacing } from '../../src/theme';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ImportRecipe() {
  const router = useRouter();
  const { session } = useAuth();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDraft(r: ParsedRecipe) {
    setDraft({
      title: r.title,
      servings: r.servings ?? 4,
      servingsGuessed: r.servings === null,
      siteCalories: r.siteCalories,
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
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!session) throw new Error('Please log in again to import a recipe.');
      const recipe = Platform.OS === 'web'
        ? await importRecipeViaBackend(url, { supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey, accessToken: session.access_token })
        : await importRecipeFromUrl(url);
      openDraft(recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that page.');
    } finally {
      setBusy(false);
    }
  }

  function importSavedPage(html: string) {
    setError(null);
    try {
      openDraft(importRecipeFromHtml(html, url));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not import that file.');
    }
  }

  return (
    <Screen variant="form" edges={[]}>
      <TextField label="Recipe web address" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={run} />
      <Button title="Import recipe" onPress={run} loading={busy} disabled={!url.trim()} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card style={{ marginTop: spacing.lg }}>
        <Heading>Import a saved page</Heading>
        <Body muted>
          If a site blocks automatic import, open the recipe in your browser and save the full page as an HTML file (on a computer, use Save Page As). Enter its original web address above, then choose the saved .html file. PDF, screenshots and Reader view do not include the structured data Buko needs.
        </Body>
        <SavedPageImport disabled={busy || !url.trim()} onLoad={importSavedPage} onError={setError} />
      </Card>
      <Card style={{ marginTop: spacing.lg }}>
        <Body muted>
          Buko reads the structured recipe data a site publishes for apps: title, ingredients, steps, servings and times. It does not copy descriptions, stories or photos, and the original link is always saved and shown with the recipe. On web, URL import uses your authenticated Supabase function; the recipe site receives no Buko account credentials. Saved HTML files are read locally, never executed or uploaded. Native URL imports fetch directly from your phone.
        </Body>
      </Card>
    </Screen>
  );
}
