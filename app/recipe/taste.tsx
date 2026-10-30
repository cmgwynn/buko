import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Chip, ChipRow, Disclosure, Heading, Loading, Notice, Screen, TextField } from '../../src/components/ui';
import { DEFAULT_TASTE, formatTasteLearning, loadTasteProfile, RECIPE_AI_CONSENT_VERSION, saveTasteProfile, type TastePreferences } from '../../src/lib/recipes/qualityClient';
import { typography } from '../../src/theme';
import { useConfirm } from '../../src/components/ConfirmProvider';
import { resetTasteLearning } from '../../src/lib/recipes/qualityClient';

const list = (value: string) => [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean))];
export default function TastePreferencesScreen() {
  const confirm = useConfirm();
  const [preferences, setPreferences] = useState<TastePreferences>(DEFAULT_TASTE);
  const [cuisines, setCuisines] = useState('');
  const [disliked, setDisliked] = useState('');
  const [minutes, setMinutes] = useState('');
  const [learned, setLearned] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    loadTasteProfile().then((value) => {
      if (!live) return;
      setPreferences(value.preferences); setCuisines(value.preferences.preferredCuisines.join(', '));
      setDisliked(value.preferences.dislikedIngredients.join(', '));
      setMinutes(value.preferences.maxCookMinutes === null ? '' : String(value.preferences.maxCookMinutes));
      setLearned(value.learned); setReady(true);
    }).catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  async function save(reset = false) {
    if (lock.current) return;
    const time = minutes.trim() ? Number(minutes) : null;
    if (!reset && time !== null && (!Number.isInteger(time) || time < 1 || time > 1440)) { setError('Choose a cooking-time limit from 1 to 1440 whole minutes.'); return; }
    lock.current = true; setBusy(true); setSaved(false); setError(null);
    try {
      const next = reset ? { ...DEFAULT_TASTE } : { ...preferences, preferredCuisines: list(cuisines), dislikedIngredients: list(disliked), maxCookMinutes: time };
      await saveTasteProfile(next);
      setPreferences(next);
      if (reset) { setCuisines(''); setDisliked(''); setMinutes(''); }
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save taste preferences.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen edges={[]} variant="form">
    <Heading>Your taste preferences</Heading>
    <Text style={typography.body}>Dislikes guide suggestions, not allergy checks. Keep dietary restrictions updated.</Text>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {!ready && !error ? <Loading /> : null}
    {ready ? <>
      <TextField label="Preferred cuisines (comma separated)" value={cuisines} onChangeText={(v) => { setCuisines(v); setSaved(false); }} editable={!busy} maxLength={500} />
      <TextField label="Disliked ingredients (comma separated)" value={disliked} onChangeText={(v) => { setDisliked(v); setSaved(false); }} editable={!busy} maxLength={500} />
      <Text style={typography.label}>Preferred heat</Text>
      <ChipRow>{(['mild', 'medium', 'hot'] as const).map((value) => <Chip key={value} label={value} selected={preferences.spiceTolerance === value} disabled={busy} onPress={() => { setPreferences((p) => ({ ...p, spiceTolerance: value })); setSaved(false); }} />)}</ChipRow>
      <TextField label="Maximum cooking minutes (optional)" value={minutes} onChangeText={(v) => { setMinutes(v); setSaved(false); }} editable={!busy} keyboardType="number-pad" />
      <Card>
        <Heading>Optional AI adaptation</Heading>
        <Text style={typography.body}>Optional AI adaptations share recipe details and preferences. Not allergy-certified.</Text>
        <Disclosure title="How AI uses recipe data"><Text style={typography.body}>If the owner enables paid AI, Anthropic receives the selected base recipe, your requested changes and relevant taste/diet preferences. It does not receive your identity, diary or health history. AI reviews are not kitchen tests or allergy certification.</Text></Disclosure>
        <Chip label={preferences.aiConsentVersion === RECIPE_AI_CONSENT_VERSION ? 'AI recipe sharing allowed' : 'AI recipe sharing off'}
          selected={preferences.aiConsentVersion === RECIPE_AI_CONSENT_VERSION} disabled={busy} onPress={() => {
            setPreferences((p) => ({ ...p, aiConsentVersion: p.aiConsentVersion === RECIPE_AI_CONSENT_VERSION ? null : RECIPE_AI_CONSENT_VERSION })); setSaved(false);
          }} />
        <Text style={typography.small}>Save to apply. Withdraw consent here anytime.</Text>
      </Card>
      {Object.keys(learned).length ? <Card><Heading>From your cooking feedback</Heading>
        <Text style={typography.small}>Your choices take priority over feedback trends.</Text>
        {Object.entries(learned).map(([name, value]) => {
          const text = formatTasteLearning(name, value);
          return text ? <Text key={name} style={typography.body}>{text}</Text> : null;
        })}
      </Card> : null}
      {saved ? <Notice tone="info">Taste preferences saved.</Notice> : null}
      <Button title="Save taste preferences" loading={busy} onPress={() => { void save(); }} />
      <Button title="Reset explicit preferences and turn off AI sharing" disabled={busy} variant="ghost" onPress={() => { void save(true); }} />
      <Button title="Reset learned taste suggestions" disabled={busy} variant="ghost" onPress={() => {
        if (lock.current) return;
        lock.current = true; setBusy(true);
        void (async () => {
          if (!await confirm({ title: 'Reset learned taste?', message: 'Future taste suggestions will start fresh. Your explicit preferences and past aggregate recipe ratings are kept.', confirmLabel: 'Reset learned taste' })) return;
          await resetTasteLearning(); setLearned({}); setSaved(false);
        })().catch((e: Error) => setError(e.message)).finally(() => { lock.current = false; setBusy(false); });
      }} />
    </> : null}
  </Screen>;
}
