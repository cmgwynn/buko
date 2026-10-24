import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Body, Button, Card, Heading, Notice, Screen } from '../src/components/ui';
import { purchase, restore, storePackages, type PurchasesPackage } from '../src/lib/billing/store';
import { config } from '../src/lib/config';
import { legalUrl } from '../src/lib/legal';
import { useAuth } from '../src/providers/AuthProvider';
import { useBilling } from '../src/providers/BillingProvider';
import { SubscriptionManagement } from '../src/components/SubscriptionManagement';
export default function Premium() {
  const { session } = useAuth();
  const billing = useBilling();
  const [items, setItems] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const privacy = legalUrl(config.privacyUrl), terms = legalUrl(config.termsUrl);
  useEffect(() => {
    let live = true;
    if (session && Platform.OS !== 'web') {
      void storePackages(session.user.id).then((result) => {
        if (live) { setItems(result); if (!result.length) setNote('Monthly and annual subscriptions are not available from the store yet.'); }
      }).catch((err: unknown) => { if (live) setError(err instanceof Error ? err.message : 'Store is unavailable.'); });
    }
    return () => { live = false; };
  }, [session?.user.id]);
  async function transact(item?: PurchasesPackage) {
    if (!session || busy) return;
    setBusy(true); setError(null); setNote(null);
    try {
      if (item) await purchase(session.user.id, item);
      else await restore(session.user.id);
      await billing.refresh(true);
      setNote('Store transaction completed. Access is shown below only after server verification; if it remains unavailable, refresh or restore again.');
    } catch (err) {
      setError(err && typeof err === 'object' && 'userCancelled' in err && err.userCancelled
        ? 'Purchase cancelled. No new access was confirmed.'
        : err instanceof Error ? err.message : 'Store transaction failed. Please retry.');
    } finally { setBusy(false); }
  }
  async function open(url: string) {
    try { await Linking.openURL(url); } catch { setError('Could not open the link. Try your device browser.'); }
  }
  return <Screen>
    <Heading>Buko Premium</Heading>
    <Card><Heading>Free, every day</Heading><Body>Scan products, keep a food diary and manage your grocery lists.</Body></Card>
    <Card><Heading>More support with Premium</Heading><Body>Meal planning, recipe importing, optional health integrations and Coach access. AI requires owner activation and remains subject to request limits.</Body>
      <Body>Subscriptions renew automatically until cancelled. Configure seven-day free trials in the stores; only eligible customers receive them. The store confirmation shows the actual offer, renewal price and billing period before you agree.</Body>
      {!billing.status.enforced ? <Notice tone="info">Trial preview: paywall enforcement is off. Your current trial access has not changed.</Notice> : null}
      <Body>{billing.status.premium ? 'Verified Premium active' : 'No active verified Premium subscription'}{billing.status.sandbox ? ' (sandbox testing)' : ''}</Body>
      {billing.status.expiresAt ? <Body muted>Verified expiry: {new Date(billing.status.expiresAt).toLocaleDateString()}</Body> : null}
      {billing.error ? <Notice tone="warning">{billing.error}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {note ? <Notice tone="info">{note}</Notice> : null}
      {!privacy || !terms ? <Notice tone="warning">Purchases are unavailable until the owner publishes and configures privacy policy and terms links.</Notice> : null}
      {Platform.OS === 'web' ? <Body muted>No web checkout. Subscribe or restore in Buko on iOS or Android using this Buko account, then refresh access here.</Body> : items.map((item) =>
        <Button key={item.identifier} title={`${item.packageType === 'ANNUAL' ? 'Annual' : 'Monthly'} subscription - ${item.product.priceString} / ${item.packageType === 'ANNUAL' ? 'year' : 'month'}`}
          disabled={busy || !privacy || !terms || !billing.status.enforced} onPress={() => { void transact(item); }} />)}
      {!billing.status.enforced && items.length ? <Body muted>Store purchases stay disabled during the unrestricted preview rollout.</Body> : null}
      <Button title="Restore purchases" variant="secondary" disabled={busy || Platform.OS === 'web'} onPress={() => { void transact(); }} />
      <Button title="Refresh subscription access" variant="secondary" loading={busy || billing.loading} onPress={() => { void billing.refresh(true); }} />
      <SubscriptionManagement />
      <Body muted>RevenueCat processes a pseudonymous account ID and purchase/device metadata, not your food, health records or chat.</Body>
      {privacy ? <Button title="Privacy policy" variant="ghost" onPress={() => { void open(privacy); }} /> : null}
      {terms ? <Button title="Terms of service" variant="ghost" onPress={() => { void open(terms); }} /> : null}
    </Card>
  </Screen>;
}
