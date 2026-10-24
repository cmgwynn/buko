import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SavedPageImport } from '../../src/components/SavedPageImport';
import { PremiumGate } from '../../src/components/PremiumGate';
import { Body, Button, Card, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { config } from '../../src/lib/config';
import { setDraft } from '../../src/lib/recipes/draft';
import { importRecipeFromHtml, importRecipeViaBackend, SUPPORTED_RECIPE_SITES } from '../../src/lib/recipes/importer';
import type { ParsedRecipe } from '../../src/lib/recipes/schemaOrg';
import { draftFromPastedRecipe, recipeToDraft } from '../../src/lib/recipes/pasteText';
import { spacing } from '../../src/theme';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ImportRecipe() {
  return <PremiumGate feature="Recipe importing"><ImportContent /></PremiumGate>;
}
function ImportContent() {
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
      <Heading>Import from a supported site</Heading>
      <Body muted>Supported hosts: {SUPPORTED_RECIPE_SITES} (with or without www). Use an HTTPS recipe link. Some publishers may block automatic import; paste is always available below.</Body>
      <TextField label="Recipe web address (optional for paste)" placeholder="https://…" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" onSubmitEditing={run} editable={!busy} />
      <Button title="Import from URL" onPress={run} loading={busy} disabled={!url.trim()} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card style={{ marginTop: spacing.lg }}>
        <Heading>Or paste ingredients and steps</Heading>
        <Body muted>
          Open a recipe you can access in your browser and copy just its ingredients and instructions here. No AI or HTML file is needed. Keep its link above and optional attribution below. Everything opens in an editable draft for review before saving.
        </Body>
        <TextField label="Recipe title" value={title} onChangeText={setTitle} placeholder="Weeknight lentil soup" editable={!busy} />
        <TextField label="Servings (optional; starts with 4)" value={servings} onChangeText={setServings} keyboardType="number-pad" placeholder="4" editable={!busy} />
        <TextField label="Ingredients — one per line" value={ingredients} onChangeText={setIngredients} multiline textAlignVertical="top" style={{ minHeight: 150 }} placeholder={'1 cup lentils\n2 cups water'} editable={!busy} />
        <TextField label="Instructions — a blank line between steps" value={steps} onChangeText={setSteps} multiline textAlignVertical="top" style={{ minHeight: 180 }} placeholder={'Combine lentils and water.\n\nSimmer for 20 minutes.'} editable={!busy} />
        <TextField label="Source / attribution (optional)" value={sourceName} onChangeText={setSourceName} placeholder="Publisher, author or family recipe" editable={!busy} />
        <Button title="Create editable draft" onPress={importPastedText} disabled={busy} />
      </Card>
      <Card style={{ marginTop: spacing.lg }}>
        <Body muted>
          URL import on phone and web uses the same authenticated service and supported-site checks. Buko reads published structured recipe data, not stories or photos, and keeps the source link. Recipe sites receive no Buko account credentials. Publisher restrictions are not bypassed. Pasted text is parsed locally into ingredients and timer suggestions; review the draft before saving.
        </Body>
        <Button title={showAdvanced ? 'Hide advanced saved HTML import' : 'Advanced: import a saved HTML page'} variant="ghost" onPress={() => setShowAdvanced(!showAdvanced)} />
        {showAdvanced ? <>
          <Body muted>If you already have a full saved .html page, enter its original address above and choose the file. Files are read locally, never executed or uploaded. PDF, screenshots and Reader view are not supported.</Body>
          <SavedPageImport disabled={busy || !url.trim()} onLoad={importSavedPage} onError={setError} />
        </> : null}
      </Card>
    </Screen>
  );
}
