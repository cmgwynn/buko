import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { colors, typography } from '../theme';
import { Button, Card, Eyebrow, NavigationRow } from './ui';

export const welcomeKey = (userId: string) => `buko:welcome-done:${userId}`;

export function useWelcome(userId: string | undefined) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    setShow(false);
    if (userId) void AsyncStorage.getItem(welcomeKey(userId)).then((v) => { if (live) setShow(v !== 'true'); }).catch(() => {});
    return () => { live = false; };
  }, [userId]);
  const dismiss = useCallback(() => {
    setShow(false);
    if (userId) void AsyncStorage.setItem(welcomeKey(userId), 'true').catch(() => {});
  }, [userId]);
  return { show, dismiss };
}

const STEPS: { title: string; subtitle: string; icon: 'sparkles-outline' | 'barbell-outline' | 'scan-outline'; href: Href }[] = [
  { title: 'Plan my week', subtitle: 'Meals built around your targets', icon: 'sparkles-outline', href: { pathname: '/(tabs)/plan', params: { generate: '1' } } },
  { title: 'Build my training plan', subtitle: 'Runs and lifts on the days you pick', icon: 'barbell-outline', href: '/workout/plan' },
  { title: 'Scan my first food', subtitle: 'Point at a barcode to log it', icon: 'scan-outline', href: '/(tabs)/scan' },
];

export function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();
  return <Card accent={colors.hero}>
    <Eyebrow>Welcome to Buko</Eyebrow>
    <Text style={typography.subheading}>Pick a place to start</Text>
    {STEPS.map((step) => (
      <NavigationRow key={step.title} title={step.title} subtitle={step.subtitle} icon={step.icon}
        onPress={() => { onDismiss(); router.push(step.href); }} />
    ))}
    <Button title="I'll explore on my own" variant="ghost" onPress={onDismiss} />
  </Card>;
}
