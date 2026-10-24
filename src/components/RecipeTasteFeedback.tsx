import { useRef, useState } from 'react';
import { Text } from 'react-native';
import * as Crypto from 'expo-crypto';
import { FEEDBACK_TAGS, saveTasteFeedback } from '../lib/recipes/qualityClient';
import { Button, Card, Chip, ChipRow, Heading, Notice, TextField } from './ui';
import { typography } from '../theme';

export function RecipeTasteFeedback({ recipeId, cookingEventId }: { recipeId: string; cookingEventId?: string }) {
  const eventId = useRef(cookingEventId ?? Crypto.randomUUID());
  const lock = useRef(false);
  const [thumb, setThumb] = useState<boolean | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [minutes, setMinutes] = useState('');
  const [spice, setSpice] = useState<string | null>(null);
  const [disliked, setDisliked] = useState('');
  const [state, setState] = useState<'editing' | 'saving' | 'saved' | 'skipped'>('editing');
  const [error, setError] = useState<string | null>(null);
  if (state === 'skipped') return null;
  if (state === 'saved') return <Card><Heading>Thanks for the taste feedback</Heading><Text style={typography.body}>Your preferences stay private. Aggregate ratings help us improve tested recipes.</Text></Card>;
  async function save() {
    if (lock.current) return;
    const time = minutes.trim() ? Number(minutes) : null;
    if (time !== null && (!Number.isInteger(time) || time < 0 || time > 1440)) { setError('Enter cooking time in whole minutes from 0 to 1440.'); return; }
    if (thumb === null && again === null && !tags.length && !spice && !disliked.trim() && time === null) { setError('Choose at least one response, or tap Skip feedback.'); return; }
    lock.current = true; setState('saving'); setError(null);
    try {
      await saveTasteFeedback({ recipeId, eventId: eventId.current, thumb, makeAgain: again, tags, actualMinutes: time, spice, disliked: disliked.split(',').map((v) => v.trim()).filter(Boolean) });
      setState('saved');
    } catch (e) { setError(e instanceof Error ? e.message : 'Feedback could not be saved.'); setState('editing'); }
    finally { lock.current = false; }
  }
  const busy = state === 'saving';
  return <Card>
    <Heading>How did it taste?</Heading>
    <Text style={typography.body}>Optional feedback for future meal suggestions.</Text>
    <ChipRow>
      <Chip label="Thumbs up" selected={thumb === true} disabled={busy} onPress={() => setThumb(thumb === true ? null : true)} />
      <Chip label="Thumbs down" selected={thumb === false} disabled={busy} onPress={() => setThumb(thumb === false ? null : false)} />
    </ChipRow>
    <Text style={typography.label}>Would make again?</Text>
    <ChipRow>
      <Chip label="Yes, make again" selected={again === true} disabled={busy} onPress={() => setAgain(again === true ? null : true)} />
      <Chip label="Not again" selected={again === false} disabled={busy} onPress={() => setAgain(again === false ? null : false)} />
    </ChipRow>
    <ChipRow>{FEEDBACK_TAGS.map((tag) => <Chip key={tag} label={tag} selected={tags.includes(tag)} disabled={busy} onPress={() => setTags((current) => current.includes(tag) ? current.filter((v) => v !== tag) : [...current, tag])} />)}</ChipRow>
    <Text style={typography.label}>Heat level (optional)</Text>
    <ChipRow>{['too mild', 'just right', 'too hot'].map((value) => <Chip key={value} label={value} selected={spice === value} disabled={busy} onPress={() => setSpice(spice === value ? null : value)} />)}</ChipRow>
    <TextField label="Actual cooking minutes (optional)" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} editable={!busy} />
    <TextField label="Ingredients you disliked (optional, comma separated)" value={disliked} onChangeText={setDisliked} maxLength={500} editable={!busy} />
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <Button title="Save taste feedback" loading={busy} onPress={() => { void save(); }} />
    <Button title="Skip feedback" variant="ghost" disabled={busy} onPress={() => setState('skipped')} />
  </Card>;
}
