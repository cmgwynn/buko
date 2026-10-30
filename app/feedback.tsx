import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { Body, Button, Card, Chip, ChipRow, Label, Notice, Screen, TextField } from '../src/components/ui';
import { config } from '../src/lib/config';
import { FEEDBACK_CATEGORIES, feedbackMailto, type FeedbackCategory } from '../src/lib/trial/core';
import { FeedbackUnavailableError, sendFeedback } from '../src/lib/trial/client';
import { useAuth } from '../src/providers/AuthProvider';

export default function Feedback() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('idea');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try { await sendFeedback(session.user.id, category, message, from); setSent(true); setMessage(''); }
    catch (e) {
      if (e instanceof FeedbackUnavailableError && config.contactEmail) {
        try { await Linking.openURL(feedbackMailto(config.contactEmail, category, message)); return; } catch { /* fall through */ }
      }
      setError(e instanceof Error ? e.message : 'Could not send feedback.');
    } finally { setBusy(false); }
  }

  if (sent) return <Screen><Card>
    <Body>Thanks! Every note is read and helps decide what we build next.</Body>
    <Button title="Send another" variant="secondary" onPress={() => setSent(false)} />
    <Button title="Done" variant="ghost" onPress={() => router.back()} />
  </Card></Screen>;

  return <Screen variant="form"><Card>
    <Label>What kind of feedback?</Label>
    <ChipRow>{FEEDBACK_CATEGORIES.map((c) => (
      <Chip key={c.key} label={c.label} selected={category === c.key} onPress={() => setCategory(c.key)} />
    ))}</ChipRow>
    <TextField label="Tell us more" value={message} onChangeText={setMessage} multiline maxLength={2000}
      placeholder={category === 'bug' ? 'What happened, and what did you expect?' : 'What would make Buko better for you?'}
      style={{ minHeight: 120, textAlignVertical: 'top' }} />
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <Button title="Send feedback" icon="send-outline" loading={busy} disabled={message.trim().length < 3} onPress={() => { void submit(); }} />
    <Body muted>Sent with your account, platform and app version so we can follow up. Avoid sharing medical details.</Body>
  </Card></Screen>;
}
