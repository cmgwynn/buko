import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { useBilling } from '../providers/BillingProvider';
import { Body, Button, Card, Heading, Loading, Notice, Screen } from './ui';
export function PremiumGate({ children, feature }: { children: ReactNode; feature: string }) {
  const billing = useBilling();
  const router = useRouter();
  if (billing.loading && billing.status.enforced) return <Loading />;
  if (billing.allowed) return <>{children}</>;
  return <Screen><Card>
    <Heading>{feature}</Heading>
    <Body>This feature is part of Buko Premium. Scanning, food logging and grocery lists remain free.</Body>
    {billing.error ? <Notice tone="warning">{billing.error}</Notice> : null}
    <Button title="View Premium & restore purchases" onPress={() => router.push('/premium')} />
    <Button title="Open free grocery list" variant="secondary" onPress={() => router.push('/(tabs)/grocery')} />
    <Button title="Back to Diary" variant="ghost" onPress={() => router.dismissTo('/(tabs)')} />
  </Card></Screen>;
}
