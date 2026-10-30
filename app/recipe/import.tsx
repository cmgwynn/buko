import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SavedPageImport } from '../../src/components/SavedPageImport';
import { Body, Button, Card, Chip, ChipRow, Disclosure, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { config } from '../../src/lib/config';
import { setDraft } from '../../src/lib/recipes/draft';
import { importRecipeFromHtml, importRecipeViaBackend, SUPPORTED_RECIPE_SITES } from '../../src/lib/recipes/importer';
import type { ParsedRecipe } from '../../src/lib/recipes/schemaOrg';
import { draftFromPastedRecipe, recipeToDraft } from '../../src/lib/recipes/pasteText';
import { spacing } from '../../src/theme';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ImportRecipe() {
  const router = useRouter();
  const { session } = useAuth();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mode, setMode] = useState<'url' | 'paste'>('url');

  function openDraft(r: ParsedRecipe) {
    setDraft(recipeToDraft(r));
    router.replace('/recipe/edit');
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!session) throw new Error('Please log in again to import a recipe.');
      const recipe = await importRecipeViaBackend(url, { supabaseUrl: config.supabaseUrl, anonKey: config.supabaseAnonKey, accessToken: session.access_token });
      openDraft(recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that page.');
    } finally {
      setBusy(false);
    }
  }

  function importPastedText() {
    if (busy) return;
    setError(null);
    try {
      setDraft(draftFromPastedRecipe({ title, servings, ingredients, steps, sourceUrl: url, sourceName }));
      router.replace('/recipe/edit');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read that recipe text.');
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
      <Heading>Import a recipe</Heading>
      <ChipRow>
        <Chip label="Recipe link" selected={mode === 'url'} onPress={() => setMode('url')} />
        <Chip label="Paste text" selected={mode === 'paste'} onPress={() => setMode('paste')} />
      </ChipRow>
      {mode === 'url' ? <>
        <Body muted>Import recipe data from supported HTTPS links. Some publishers block imports.</Body>
        <TextField label="Recipe web address" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={run} editable={!busy} />
        <Button title="Import recipe" onPress={run} loading={busy} disabled={!url.trim()} />
      </> : <>
        <Body muted>Paste ingredients and steps. Drafts stay private until you save.</Body>
        <TextField label="Source link (optional)" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} />
        <TextField label="Publisher / attribution (optional)" value={sourceName} onChangeText={setSourceName} placeholder="Publisher, author or family recipe" editable={!busy} />
        <TextField label="Recipe title" value={title} onChangeText={setTitle} placeholder="Weeknight lentil soup" editable={!busy} />
        <TextField label="Servings (optional; starts with 4)" value={servings} onChangeText={setServings} keyboardType="number-pad" placeholder="4" editable={!busy} />
        <TextField label="Ingredients — one per line" value={ingredients} onChangeText={setIngredients} multiline textAlignVertical="top" style={{ minHeight: 140 }} placeholder={'1 cup lentils\n2 cups water'} editable={!busy} />
        <TextField label="Instructions — separate steps with a blank line" value={steps} onChangeText={setSteps} multiline textAlignVertical="top" style={{ minHeight: 160 }} placeholder={'Combine lentils and water.\n\nSimmer for 20 minutes.'} editable={!busy} />
        <Button title="Review editable recipe" onPress={importPastedText} disabled={busy} />
      </>}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {mode === 'url' ? <Card style={{ marginTop: spacing.lg }}>
        <Disclosure title="About recipe imports">
          <Body muted>Supported sites only: {SUPPORTED_RECIPE_SITES}. Buko reads published structured recipe data, not stories or photos, and keeps the source link. Publisher restrictions are not bypassed. Review imported ingredients and amounts before saving.</Body>
        </Disclosure>
        <Button title={showAdvanced ? 'Hide advanced saved HTML import' : 'Advanced: import a saved HTML page'} variant="ghost" onPress={() => setShowAdvanced(!showAdvanced)} />
        {showAdvanced ? <>
          <Disclosure title="About saved HTML"><Body muted>If you already have a full saved .html page, enter its original address above and choose the file. Files are read locally, never executed or uploaded. PDF, screenshots and Reader view are not supported.</Body></Disclosure>
          <SavedPageImport disabled={busy || !url.trim()} onLoad={importSavedPage} onError={setError} />
        </> : null}
      </Card> : null}
    </Screen>
  );
}
