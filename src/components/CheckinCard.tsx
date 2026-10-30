import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { checkinPromptDay, reviewWeek } from '../lib/planning/checkin';
import { checkinDone, markCheckinDone } from '../lib/planning/checkinClient';
import { colors, typography } from '../theme';
import { Button, Card, Eyebrow } from './ui';

export function useCheckinPrompt(userId: string | undefined, today: string) {
  const [show, setShow] = useState(false);
  const week = reviewWeek(today).start;
  useFocusEffect(useCallback(() => {
    let live = true;
    setShow(false);
    if (userId && checkinPromptDay(today)) void checkinDone(userId, week).then((done) => { if (live) setShow(!done); });
    return () => { live = false; };
  }, [userId, today, week]));
  const dismiss = useCallback(() => {
    setShow(false);
    if (userId) void markCheckinDone(userId, week, 'skipped').catch(() => {});
  }, [userId, week]);
  return { show, dismiss };
}

export function CheckinCard({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();
  return <Card accent={colors.primary}>
    <Eyebrow>Weekly check-in</Eyebrow>
    <Text style={typography.subheading}>How did last week go?</Text>
    <Text style={typography.small}>Two taps, and Buko tunes your next week.</Text>
    <Button title="Start check-in" icon="checkmark-done-outline" onPress={() => router.push('/checkin')} />
    <Button title="Not now" variant="ghost" onPress={onDismiss} />
  </Card>;
}
