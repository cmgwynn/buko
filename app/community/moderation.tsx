import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Body, Button, Card, Heading, Notice, Screen, TextField } from '../../src/components/ui';
import { communityRpc, type CommunityReport } from '../../src/lib/recipes/community';

export default function CommunityModeration() {
  const router = useRouter();
  const [rows, setRows] = useState<CommunityReport[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try { setRows(await communityRpc<CommunityReport[]>('community_reports_queue')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Reports unavailable.'); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function decide(id: string, remove: boolean) {
    setBusy(true); setError(null);
    try { await communityRpc('community_moderate', { p_report: id, p_remove: remove, p_reason: notes[id] }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Moderation failed.'); }
    finally { setBusy(false); }
  }
  return <Screen edges={[]}>
    <Heading>Reported contributions</Heading>
    <Body muted>Restricted to designated moderators. Oldest 50 open reports; refresh for the next page. Decisions are recorded privately. Removing a shared recipe also hides its reviews.</Body>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <Button title="Refresh reports" loading={busy} onPress={() => void load()} />
    {!busy && !error && !rows.length ? <Body>No open reports.</Body> : null}
    {rows.map((r) => <Card key={r.id}>
      <Heading>{r.recipe_title}</Heading>
      <Body>Report: {r.reason}</Body>{r.review_body ? <Body>Review: {r.review_body}</Body> : null}
      {r.recipe_id ? <Button title="Inspect reported recipe" variant="ghost" onPress={() => router.push({ pathname: '/community/[id]', params: { id: r.recipe_id! } })} /> : null}
      <TextField label="Decision reason" value={notes[r.id] ?? ''} onChangeText={(v) => setNotes({ ...notes, [r.id]: v })} maxLength={2000} multiline />
      <Button title="Remove reported contribution" disabled={busy || (notes[r.id] ?? '').trim().length < 5} variant="danger" onPress={() => void decide(r.id, true)} />
      <Button title="Keep contribution and resolve report" disabled={busy || (notes[r.id] ?? '').trim().length < 5} variant="secondary" onPress={() => void decide(r.id, false)} />
    </Card>)}
  </Screen>;
}
