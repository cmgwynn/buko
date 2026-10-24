import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { Body, Button, Card, Chip, ChipRow, Heading, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { loadRecipe } from '../../src/lib/recipes/db';
import {
  approveCuratedVersion, archiveCuratedBase, curatedFromPrivate, isRecipeAdmin, loadCuratedVersions, loadQualityFlags,
  recordCuratedTest, saveCuratedDraft, type CuratedVersion, type QualityFlag,
} from '../../src/lib/recipes/qualityClient';
import { supabase } from '../../src/lib/supabase';
import { typography } from '../../src/theme';
import { useAuth } from '../../src/providers/AuthProvider';
import { checkRecipe } from '../../src/lib/recipes/quality/checks';
import { RecipeQualityFindings } from '../../src/components/RecipeQualityFindings';

const split = (value: string) => [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))];
export default function RecipeAdmin() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const confirm = useConfirm();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [versions, setVersions] = useState<CuratedVersion[]>([]);
  const [flags, setFlags] = useState<QualityFlag[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<{ id: string; title: string }[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [versionLimit, setVersionLimit] = useState(12);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState('');
  const [meal, setMeal] = useState('dinner');
  const [diet, setDiet] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [proteins, setProteins] = useState('');
  const [dietarySwaps, setDietarySwaps] = useState('');
  const [status, setStatus] = useState<CuratedVersion['status']>('draft');
  const [testVersion, setTestVersion] = useState<string | null>(null);
  const [rating, setRating] = useState(4);
  const [makeAgain, setMakeAgain] = useState(true);
  const [actualMinutes, setActualMinutes] = useState('');
  const [testNotes, setTestNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    setRecipeId(null); setBaseId(null); setRecipeSearch(''); setCuisine(''); setSource('');
    setProteins(''); setDietarySwaps(''); setTestNotes(''); setActualMinutes(''); setTestVersion(null);
  }, [userId]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    const allowed = await isRecipeAdmin();
    if (request !== generation.current) return;
    setAdmin(allowed);
    if (!allowed) return;
    const [rows, review] = await Promise.all([loadCuratedVersions(), loadQualityFlags()]);
    if (request !== generation.current) return;
    setVersions(rows); setFlags(review);
  }, [userId]);
  useFocusEffect(useCallback(() => {
    setAdmin(null); setVersions([]); setFlags([]); setSavedRecipes([]); setError(null);
    void load().catch((e: Error) => setError(e.message));
    return () => { generation.current++; };
  }, [load]));
  useEffect(() => {
    if (!admin) return;
    let live = true;
    setSavedRecipes([]);
    const timer = setTimeout(() => {
      const query = recipeSearch.trim().replace(/[\\%_]/g, '\\$&');
      void (async () => {
        try {
          const { data, error } = await supabase.from('recipes').select('id,title').ilike('title', `%${query}%`).order('title').limit(50);
          if (error) throw new Error(error.message);
          if (live) setSavedRecipes(data);
        } catch (e) { if (live) setError(e instanceof Error ? e.message : 'Saved recipes could not be searched.'); }
      })();
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [admin, recipeSearch, userId]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await action(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Recipe quality action failed.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function addDraft() {
    if (!recipeId) { setError('Choose a saved recipe to curate.'); return; }
    if (!cuisine.trim() || !source.trim()) { setError('Add a cuisine and original/permission/source notes before saving.'); return; }
    void run(async () => {
      const full = await loadRecipe(recipeId);
      const recipe = curatedFromPrivate(full, cuisine.trim(), [meal], diet);
      await saveCuratedDraft(recipe, source, {
        allowedProteinSwaps: split(proteins), allowedDietarySwaps: split(dietarySwaps), maxSubstitutions: 2,
      }, baseId);
      setNotice('Draft version saved. Cook it and record a test before approval.');
    });
  }
  function recordTest() {
    const time = Number(actualMinutes);
    if (!testVersion || !actualMinutes.trim() || !Number.isInteger(time) || time < 0 || time > 1440) { setError('Enter an actual cooking time from 0 to 1440 whole minutes.'); return; }
    void run(async () => {
      await recordCuratedTest(testVersion, rating, makeAgain, time, testNotes);
      setTestVersion(null); setTestNotes(''); setActualMinutes(''); setNotice('Human cooking test recorded.');
    });
  }
  return <Screen edges={[]} variant="form">
    <Heading>Recipe quality</Heading>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {admin === null && !error ? <Loading /> : null}
    {admin === false ? <Notice tone="danger">Only recipe admins can access curation. Access is verified on the server.</Notice> : null}
    {admin === true ? <>
      <Body>Only recipes you have actually cooked and approved earn Tested. AI reviews never count as human cooking tests.</Body>
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      <Card>
        <Heading>Add a base recipe or new version</Heading>
        <Body muted>Create or edit a private recipe using the existing ingredient matcher, then select it here. This preserves measured quantities and nutrition sources.</Body>
        <Button title="Create or edit my recipes" variant="secondary" onPress={() => router.push('/(tabs)/recipes')} />
        <TextField label="Find a saved recipe to curate" value={recipeSearch} onChangeText={(value) => { setRecipeSearch(value); setRecipeId(null); }} editable={!busy} />
        <Body muted>Showing up to 12 title matches. Search your saved recipes to narrow the list.</Body>
        <ChipRow>{savedRecipes.slice(0, 12).map((recipe) => <Chip key={recipe.id} label={recipe.title} selected={recipeId === recipe.id} disabled={busy} onPress={() => setRecipeId(recipe.id)} />)}</ChipRow>
        {recipeId ? <Body muted>Selected: {savedRecipes.find((r) => r.id === recipeId)?.title}</Body> : null}
        <Text style={typography.label}>Version destination</Text>
        <ChipRow>
          <Chip label="New base recipe" selected={baseId === null} disabled={busy} onPress={() => setBaseId(null)} />
          {versions.filter((v, i, rows) => rows.findIndex((r) => r.base_recipe_id === v.base_recipe_id) === i).map((v) =>
            <Chip key={v.base_recipe_id} label={`New version: ${v.recipe.title}`} selected={baseId === v.base_recipe_id} disabled={busy} onPress={() => setBaseId(v.base_recipe_id)} />)}
        </ChipRow>
        <TextField label="Cuisine" value={cuisine} onChangeText={setCuisine} maxLength={80} editable={!busy} />
        <ChipRow>{['breakfast', 'lunch', 'dinner', 'snack'].map((value) => <Chip key={value} label={value} selected={meal === value} disabled={busy} onPress={() => setMeal(value)} />)}</ChipRow>
        <Text style={typography.label}>Diet tags (check ingredients; not allergy certification)</Text>
        <ChipRow>{['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'nut_free'].map((value) => <Chip key={value} label={value.replace('_', '-')} selected={diet.includes(value)} disabled={busy}
          onPress={() => setDiet((current) => current.includes(value) ? current.filter((v) => v !== value) : [...current, value])} />)}</ChipRow>
        <TextField label="Original recipe / source and permission notes" multiline value={source} onChangeText={setSource} maxLength={4000} editable={!busy} />
        <TextField label="Allowed protein replacement ingredients (comma separated)" value={proteins} onChangeText={setProteins} maxLength={1000} editable={!busy} />
        <TextField label="Allowed dietary replacement ingredients (comma separated)" value={dietarySwaps} onChangeText={setDietarySwaps} maxLength={1000} editable={!busy} />
        <Body muted>At most two substitutions. Replacement nutrition must come from trusted approved ingredients; free-text permission is not enough to invent nutrition.</Body>
        <Button title="Save curated draft" loading={busy} disabled={!recipeId} onPress={addDraft} />
      </Card>
      <Heading>Review queue</Heading>
      {!flags.length ? <Body muted>No bases currently meet the poor-rating review threshold.</Body> : flags.map((flag, index) =>
        <Notice key={flag.version_id ?? index} tone="danger">{flag.title ?? 'Base recipe'} · {flag.disposition ?? 'rating group'} · {flag.distinct_users ?? 0} raters · {Math.round((flag.thumbs_down_rate ?? 0) * 100)}% thumbs down. Review the base and adaptations separately.</Notice>)}
      <ChipRow>{(['draft', 'tested', 'approved'] as const).map((value) => <Chip key={value} label={value} selected={status === value} onPress={() => { setStatus(value); setVersionLimit(12); }} />)}</ChipRow>
      {versions.filter((v) => v.status === status).slice(0, versionLimit).map((version) => <Card key={version.id}>
        <Heading>{version.recipe.title}</Heading>
        <Body muted>Version {version.version} · {version.status}{version.archived_at ? ' · base paused' : ''} · {version.recipe.servings} servings · {version.recipe.cuisine}</Body>
        <Text style={typography.body}>{version.recipe.ingredients.map((i) => i.raw_text).join('\n')}</Text>
        {version.recipe.steps.map((step, index) => <Text key={index} style={typography.body}>{index + 1}. {step.text}</Text>)}
        <Text style={typography.small}>{version.source_notes}</Text>
        <RecipeQualityFindings recipe={version.recipe} />
        {(version.tests ?? []).map((test, index) => <Text key={index} style={typography.small}>Test: {test.rating}/5 · {test.actual_minutes} min · {test.would_make_again ? 'Make again' : 'Would not make again'} · {test.notes}</Text>)}
        {version.status !== 'approved' ? <>
          <Button title={`Record cooking test: ${version.recipe.title}`} variant="secondary" disabled={busy} onPress={() => setTestVersion(version.id)} />
          <Button title={`Approve ${version.recipe.title}`} disabled={busy || version.status !== 'tested'} onPress={() => { void run(async () => {
            if (!await confirm({ title: 'Approve this tested version?', message: 'Confirm the recorded cooking test and ingredient/technique issues are resolved. Members and AI suggestions will be able to use this exact version.', confirmLabel: 'Approve recipe' })) return;
            const findings = checkRecipe(version.recipe, { weeknight: true, dietTags: version.recipe.dietTags, excludedIngredients: [] });
            if (!findings.valid) throw new Error(`Approval blocked: ${findings.issues.filter((issue) => issue.severity === 'blocking').map((issue) => issue.detail).join(' ')}`);
            await approveCuratedVersion(version.id); setNotice('Recipe approved for suggestions.');
          }); }} />
        </> : <Body muted>Approved content is immutable. Use a saved private recipe above to create a new draft version.</Body>}
        <Button title={version.archived_at ? 'Resume base in suggestions' : 'Pause base in suggestions'} variant="ghost" disabled={busy}
          onPress={() => { void run(async () => {
            await archiveCuratedBase(version.base_recipe_id, !version.archived_at);
            setNotice(version.archived_at ? 'Base returned to eligible suggestions.' : 'Base paused for quality review. Existing private copies are kept.');
          }); }} />
        {testVersion === version.id ? <>
          <Heading>Actual cooking test</Heading>
          <Text style={typography.label}>Taste rating</Text>
          <ChipRow>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={`${n} stars`} selected={rating === n} disabled={busy} onPress={() => setRating(n)} />)}</ChipRow>
          <Chip label={makeAgain ? 'Would make again: Yes' : 'Would make again: No'} selected={makeAgain} disabled={busy} onPress={() => setMakeAgain(!makeAgain)} />
          <TextField label="Actual cooking minutes" keyboardType="number-pad" value={actualMinutes} onChangeText={setActualMinutes} editable={!busy} />
          <TextField label="Test notes and resolved issues" multiline value={testNotes} onChangeText={setTestNotes} editable={!busy} maxLength={4000} />
          <Button title="Save human cooking test" loading={busy} onPress={recordTest} />
        </> : null}
      </Card>)}
      {versions.filter((v) => v.status === status).length > versionLimit ? <Button title="Show more recipe versions" variant="secondary" onPress={() => setVersionLimit((count) => count + 12)} /> : null}
    </> : null}
  </Screen>;
}
