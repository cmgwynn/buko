import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Chip, ChipRow, Disclosure, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { loadApprovedRecipes, loadQualityStatus, loadTasteProfile, qualityRequest, type CuratedVersion, type SuggestionRequest } from '../../src/lib/recipes/qualityClient';
import { useProfile } from '../../src/providers/ProfileProvider';
import { typography } from '../../src/theme';
import { useBilling } from '../../src/providers/BillingProvider';

export default function SuggestRecipe() {
  const router = useRouter();
  const { profile } = useProfile();
  const billing = useBilling();
  const [versions, setVersions] = useState<CuratedVersion[]>([]);
  const [cuisine, setCuisine] = useState('');
  const [meal, setMeal] = useState('dinner');
  const [weeknight, setWeeknight] = useState(true);
  const [minutes, setMinutes] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [base, setBase] = useState<string | undefined>();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ recipeId: string; disposition: string; note: string } | null>(null);
  const request = useRef<{ id: string; key: string } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    Promise.all([loadApprovedRecipes(), loadTasteProfile(), loadQualityStatus()]).then(([rows, taste, status]) => {
      if (!live) return;
      setVersions(rows); setEnabled(status.enabled);
      setCuisine(taste.preferences.preferredCuisines[0] ?? '');
      setMinutes(taste.preferences.maxCookMinutes === null ? '' : String(taste.preferences.maxCookMinutes));
    }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  async function suggest() {
    if (lock.current) return;
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'suggest' } }); return; }
    const numeric = [minutes, calories, protein].map((value) => value.trim() ? Number(value) : undefined);
    if (numeric.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0))) { setError('Targets and time must be positive numbers, or left blank.'); return; }
    const constraints: SuggestionRequest['constraints'] = {
      dietTags: profile?.diet_prefs ?? [], excludedIngredients: [], cuisine: cuisine.trim() || undefined, mealType: meal,
      maxMinutes: numeric[0], targetCalories: numeric[1], targetProtein: numeric[2],
      weeknight,
    };
    const key = JSON.stringify({ constraints, base });
    if (request.current?.key !== key) request.current = { id: Crypto.randomUUID(), key };
    lock.current = true; setBusy(true); setError(null); setResult(null);
    try {
      const value = await qualityRequest<{ recipeId: string; disposition: string; note: string }>({ operation: 'suggest', requestId: request.current.id, baseVersionId: base, constraints });
      if (!value || typeof value.recipeId !== 'string' || !value.recipeId || typeof value.note !== 'string'
        || !['tested', 'adapted', 'fallback'].includes(value.disposition)) throw new Error('The server did not confirm a saved recipe. Retry the same request.');
      setResult(value);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not suggest a meal.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen edges={[]} variant="form">
    <Heading>Find a tested meal</Heading>
    <Text style={typography.body}>Start with an approved, human-tested recipe.</Text>
    <Disclosure title="About meal suggestions"><Text style={typography.small}>AI adaptations are limited and get a separate chef review. Nutrition targets are estimates, not guarantees.</Text></Disclosure>
    <Text style={typography.small}>Saves one private copy. Nothing is shared, planned, or logged as eaten.</Text>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {enabled === false ? <Notice tone="info">Paid AI is off. Choose an approved recipe without model processing.</Notice> : null}
    {enabled === true ? <Notice tone="info">AI adaptations need your saved consent in Taste preferences.</Notice> : null}
    <Button title="Taste preferences & AI consent" variant="ghost" onPress={() => router.push('/recipe/taste')} />
    <TextField label="Cuisine (optional)" value={cuisine} onChangeText={setCuisine} editable={!busy} maxLength={80} />
    <ChipRow>{['breakfast', 'lunch', 'dinner', 'snack'].map((value) => <Chip key={value} label={value} selected={meal === value} disabled={busy} onPress={() => setMeal(value)} />)}</ChipRow>
    <Chip label="Keep it weeknight-simple" selected={weeknight} disabled={busy} onPress={() => setWeeknight(!weeknight)} />
    <TextField label="Maximum total minutes (optional)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={!busy} />
    <TextField label="Calories per serving (optional)" value={calories} onChangeText={setCalories} keyboardType="number-pad" editable={!busy} />
    <TextField label="Protein grams per serving (optional)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" editable={!busy} />
    <Heading>Approved starting recipes</Heading>
    {!versions.length ? <><Text style={typography.body}>No approved recipes yet.</Text><Text style={typography.small}>An admin must test and approve bases; existing libraries are unchanged.</Text></> : <ChipRow>
      <Chip label="Closest match" selected={!base} disabled={busy} onPress={() => setBase(undefined)} />
      {versions.map((version) => <Chip key={version.id} label={version.recipe.title} selected={base === version.id} disabled={busy} onPress={() => setBase(version.id)} />)}
    </ChipRow>}
    <Button title="Find and save a private meal" loading={busy} disabled={!versions.length || enabled === null} onPress={() => { void suggest(); }} />
    {result ? <Card><Heading>{result.disposition === 'adapted' ? 'Adapted meal saved' : 'Tested meal saved'}</Heading>
      <Text style={typography.body}>{result.note}</Text>
      <Button title="Open saved recipe" onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: result.recipeId } })} />
    </Card> : null}
  </Screen>;
}
