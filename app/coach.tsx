import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Disclosure, Heading, Loading, Notice, Screen, TextField } from '../src/components/ui';
import {
  applyCoachAction, clearCoachHistory, coachRequest, loadCoachHistory, loadCoachPreferences,
  saveCoachPreferences, type CoachSummary,
} from '../src/lib/coach/client';
import { calendarDate, shiftDay } from '../src/lib/coach/core';
import {
  COACH_CONSENT_VERSION, COACH_NOTICE, type CoachAction, type CoachFocus, type CoachPreferences,
  type CoachReply, type WeeklyFacts,
} from '../src/lib/coach/types';
import { DateField } from '../src/components/date/DateField';
import { useAuth } from '../src/providers/AuthProvider';
import { useBilling } from '../src/providers/BillingProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { spacing, typography } from '../src/theme';

const FOCUS: { key: CoachFocus; label: string }[] = [
  { key: 'balanced', label: 'Balanced habits' }, { key: 'protein', label: 'Protein' },
  { key: 'consistency', label: 'Consistency' }, { key: 'movement', label: 'Movement' },
];
function Facts({ facts }: { facts: WeeklyFacts }) {
  return (
    <Card>
      <Heading>Your logged week</Heading>
      <Body muted>{facts.start} to {facts.end}</Body>
      <Body>{facts.daysWithLogs} days with food logs · {facts.completeDays} marked complete</Body>
      <Body>Average on logged days: {facts.averageLoggedCalories ?? 'unknown'} kcal · {facts.averageLoggedProtein ?? 'unknown'} g protein</Body>
      <Body>Target comparison: {facts.targetComparisonDays} complete days with snapshots</Body>
      {facts.averageCompleteDayDifference !== null ? <Body>Average difference on comparable complete days: {facts.averageCompleteDayDifference > 0 ? '+' : ''}{facts.averageCompleteDayDifference} kcal</Body> : null}
      <Body>{facts.workouts} Buko workouts · {facts.workoutMinutes} minutes</Body>
      <Body>Current product score average: {facts.averageProductScore ?? 'unavailable'} · {facts.scoredProductEntries} scored logged entries · {facts.unscoredProductEntries} unscored</Body>
      <Body>Weight trend: {facts.weightTrendKg === null ? 'insufficient data or sharing off' : `${facts.weightTrendKg > 0 ? '+' : ''}${facts.weightTrendKg} kg`} · {facts.weightMeasurements} measurements</Body>
      {facts.limitations.map((text) => <Body key={text} muted>{text}</Body>)}
    </Card>
  );
}
export default function Coach() {
  const router = useRouter();
  const { session } = useAuth();
  const billing = useBilling();
  const { today } = useProfile();
  const [prefs, setPrefs] = useState<CoachPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [replies, setReplies] = useState<CoachReply[]>([]);
  const [summary, setSummary] = useState<WeeklyFacts | null>(null);
  const [message, setMessage] = useState('');
  const [section, setSection] = useState<'weekly' | 'chat' | 'preferences'>('weekly');
  const [selected, setSelected] = useState<CoachAction | null>(null);
  const [day, setDay] = useState(() => shiftDay(today, 1));
  const [meal, setMeal] = useState('dinner');
  const [servings, setServings] = useState('1');
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const consented = prefs?.consent_version === COACH_CONSENT_VERSION;
  const support = replies.some((reply) => reply.safety);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const preferences = await loadCoachPreferences();
      setPrefs(preferences ?? (session ? { user_id: session.user.id, consent_version: null, focus: 'balanced', include_weight: false } : null));
      if (preferences?.consent_version === COACH_CONSENT_VERSION) setReplies(await loadCoachHistory());
      else setReplies([]);
      const status = await coachRequest<{ enabled: boolean }>('status', today);
      setEnabled(status.enabled);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load Coach.'); }
    finally { setLoading(false); }
  }, [session, today]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function changePreferences(next: CoachPreferences) {
    setBusy(true); setError(null);
    try {
      await saveCoachPreferences(next); setPrefs(next); setSummary(null); setSelected(null);
      if (!next.consent_version) { setReplies([]); setSection('preferences'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save Coach preferences.'); }
    finally { setBusy(false); }
  }
  async function request(operation: 'summary' | 'weekly' | 'chat') {
    if (busy) return;
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'coach' } }); return; }
    setBusy(true); setError(null); setStatusNote(null);
    try {
      const result = await coachRequest<CoachReply | CoachSummary>(operation, today, operation === 'chat' ? message : undefined);
      if ('id' in result) {
        setReplies((current) => [...current.filter((reply) => reply.id !== result.id), result]);
        if (operation === 'chat') setMessage('');
        if (result.safety) { setSummary(null); setSelected(null); }
      } else { setSummary(result.facts); setEnabled(result.enabled); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Coach request failed.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!selected || busy) return;
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'coach' } }); return; }
    if (selected.kind === 'recipe' && (!calendarDate(day) || !Number.isFinite(Number(servings)) || Number(servings) < 0.25 || Number(servings) > 20)) {
      setError('Choose a plan date and servings between 0.25 and 20.'); return;
    }
    setBusy(true); setError(null);
    try {
      await applyCoachAction(selected, day, meal, Number(servings));
      setReplies((current) => current.map((reply) => ({ ...reply, actions: reply.actions.map((action) =>
        action.id === selected.id ? { ...action, applied_at: new Date().toISOString() } : action) })));
      setStatusNote(selected.kind === 'recipe' ? 'Added to your meal plan. Nothing was logged as eaten.' : 'Alternative added to groceries. Your original item was not removed.');
      setSelected(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not apply suggestion.'); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError(null);
    try { await clearCoachHistory(); setReplies([]); setSummary(null); setSelected(null); setConfirmClear(false); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not clear Coach history.'); }
    finally { setBusy(false); }
  }
  if (loading) return <Loading />;
  return (
    <Screen>
      <Heading>Your wellness coach</Heading>
      <Button title="Find a tested meal" variant="secondary" onPress={() => router.push('/recipe/suggest')} />
      <Notice tone="info">{COACH_NOTICE}</Notice><Body muted>Nothing changes without your confirmation.</Body>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {statusNote ? <Notice tone="info">{statusNote}</Notice> : null}
      <ChipRow>
        <Chip label="Weekly review" selected={section === 'weekly'} onPress={() => setSection('weekly')} />
        <Chip label="Chat" selected={section === 'chat'} onPress={() => setSection('chat')} />
        <Chip label="Preferences & privacy" selected={section === 'preferences'} onPress={() => setSection('preferences')} />
      </ChipRow>
      <View style={{ height: spacing.lg }} />
      {!enabled ? <><Notice tone="warning">Live AI is off; no paid AI requests run.</Notice><Body muted>Weekly summaries need backend setup; chat and suggestions need owner activation.</Body></> : null}
      {!billing.allowed ? <Card><Body>Coach needs Plus. Consent and history controls stay free.</Body>
        <Button title="See Buko Plus" variant="secondary" onPress={() => router.push('/premium')} /></Card> : null}
      {(!consented || section === 'preferences') && prefs ? (
        <Card>
          <Heading>You choose what guides the coach</Heading>
          <Body muted>Coach is optional. See what data it uses and how.</Body>
          <Disclosure title="How Coach uses your data">
            <Body muted>If live AI is enabled, minimized food-log summaries, goals, dietary preferences, selected recipe/product information and recent chat are processed by Anthropic. Names, email, account identifiers and birthday are excluded from structured model context. Avoid identifiers in chat or recipe titles; automatic redaction can miss them.</Body>
            <Body muted>Apple Health / Health Connect workouts and active-energy records are excluded. Weight measurements are shared only if you enable the separate weight option. Anthropic follows its API data terms; zero retention is not guaranteed.</Body>
            <Body muted>Turning Coach off stops future processing. Clear history to delete saved conversations, check-ins and unused action cards. Applied plan/grocery entries remain; usage counters are retained for cost control.</Body>
          </Disclosure>
          <Button title="Read Anthropic privacy information" variant="ghost" onPress={() => { void Linking.openURL('https://privacy.claude.com/').catch(() => setError('Could not open the privacy link. Visit privacy.claude.com in your browser.')); }} />
          <Body>What should Coach prioritize?</Body>
          <ChipRow>{FOCUS.map((item) => <Chip key={item.key} label={item.label} selected={prefs.focus === item.key}
            onPress={() => { if (!busy) void changePreferences({ ...prefs, focus: item.key }); }} />)}</ChipRow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg }}>
            <View style={{ flex: 1 }}><Body>Include weight trend</Body><Body muted>Off by default. Share weight only if you want weight-focused feedback.</Body></View>
            <Switch accessibilityLabel="Include weight trend" value={prefs.include_weight} disabled={busy} onValueChange={(value) => { void changePreferences({ ...prefs, include_weight: value }); }} />
          </View>
          <Button title={consented ? 'Turn Coach off / withdraw consent' : 'I agree — enable optional Coach features'} variant={consented ? 'secondary' : 'primary'} loading={busy}
            onPress={() => changePreferences({ ...prefs, consent_version: consented ? null : COACH_CONSENT_VERSION })} />
          <Button title="Clear Coach history" variant="danger" disabled={busy} onPress={() => setConfirmClear(true)} />
          {confirmClear ? <>
            <Body>Delete all saved Coach conversations and check-ins? This cannot be undone.</Body>
            <Button title="Confirm clear Coach history" variant="danger" loading={busy} onPress={clear} />
            <Button title="Keep history" variant="ghost" disabled={busy} onPress={() => setConfirmClear(false)} />
          </> : null}
        </Card>
      ) : null}
      {consented && section !== 'preferences' ? (
        <>
          {support ? <><Notice tone="info">Food feedback and actions are paused. Support resources come first.</Notice><Body muted>Clear conversation history in Preferences.</Body></> : null}
          {section === 'weekly' ? (
            <>
              <Body muted>Reviews the previous completed Monday–Sunday week. One AI check-in per week.</Body>
              <Body muted>Facts reflect available logs, not assumptions.</Body>
              <Button title="Review my logged week (no AI)" variant="secondary" loading={busy} onPress={() => request('summary')} />
              <Button title="Get weekly Coach suggestions" loading={busy} disabled={!enabled} onPress={() => request('weekly')} />
              {summary && !support ? <Facts facts={summary} /> : null}
            </>
          ) : (
            <Card>
              <Body muted>Ask about your logs or saved recipes. Not medical advice.</Body>
              <Disclosure title="Coach limitations"><Body muted>Coach cannot explain medical causes or invent missing nutrition. Only saved, matched recipes can become plan actions.</Body></Disclosure>
              <TextField label="Ask Coach" value={message} onChangeText={setMessage} multiline maxLength={2000} editable={!busy} placeholder="What small habit could help me this week?" />
              <Button title="Send to Coach" loading={busy} disabled={!message.trim() || !enabled} onPress={() => request('chat')} />
            </Card>
          )}
          {(support ? replies.filter((reply) => reply.safety).slice(-1) : replies.filter((reply) => reply.kind === (section === 'weekly' ? 'weekly' : 'chat'))).map((reply) => (
            <View key={reply.id}>
              {reply.facts && !support ? <Facts facts={reply.facts} /> : null}
              <Card>
                <Text selectable style={typography.body}>{reply.text}</Text>
                {reply.suggestions.map((suggestion, index) => <Text key={index} style={[typography.body, { marginTop: spacing.md }]}>{index + 1}. {suggestion}</Text>)}
                {!support ? reply.actions.map((action) => (
                  <View key={action.id} style={{ marginTop: spacing.lg }}>
                    <Body>{action.title}</Body><Body muted>{action.detail}</Body>
                    <Button title={action.applied_at ? 'Added' : action.kind === 'recipe' ? `Plan ${action.title}` : `Add ${action.title} to groceries`}
                      variant="secondary" disabled={busy || Boolean(action.applied_at)} onPress={() => { setSelected(action); setError(null); }} />
                  </View>
                )) : null}
              </Card>
            </View>
          ))}
        </>
      ) : null}
      {selected && consented && !support ? (
        <Card>
          <Heading>Confirm suggestion</Heading><Body>{selected.title}</Body><Body muted>{selected.detail}</Body>
          {selected.kind === 'recipe' ? <>
            <DateField label="Plan date" value={day} minDate={today} onChange={setDay} />
            <ChipRow>{['breakfast', 'lunch', 'dinner', 'snack'].map((value) => <Chip key={value} label={value} selected={meal === value} onPress={() => setMeal(value)} />)}</ChipRow>
            <TextField label="Servings to plan" value={servings} onChangeText={setServings} keyboardType="decimal-pad" />
          </> : <><Body muted>Adds one item; it doesn't remove the original.</Body><Body muted>Availability and allergen suitability aren't guaranteed.</Body></>}
          <Button title={selected.kind === 'recipe' ? 'Confirm add to meal plan' : 'Confirm add to groceries'} loading={busy} onPress={apply} />
          <Button title="Cancel suggestion" variant="ghost" disabled={busy} onPress={() => setSelected(null)} />
        </Card>
      ) : null}
      {error ? <Button title="Reload Coach" variant="secondary" disabled={busy} onPress={() => { void load(); }} /> : null}
      <Button title="Back to Diary" variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
    </Screen>
  );
}
