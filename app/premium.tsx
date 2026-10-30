import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Disclosure, Eyebrow, HeroCard, Notice, Screen } from '../src/components/ui';
import { SubscriptionManagement } from '../src/components/SubscriptionManagement';
import { purchase, restore, storePackages, type PurchasesPackage } from '../src/lib/billing/store';
import { annualSavings, ctaTitle, freeTrialText, orderPlans, paywallHeadline, perMonth, renewalText } from '../src/lib/billing/paywall';
import { config } from '../src/lib/config';
import { legalUrl } from '../src/lib/legal';
import { useAuth } from '../src/providers/AuthProvider';
import { useBilling } from '../src/providers/BillingProvider';
import { colors, radius, spacing, typography } from '../src/theme';

const PLUS = [
  { icon: 'restaurant-outline', text: 'Weekly meal plans built for your goal and macros' },
  { icon: 'barbell-outline', text: '4-week run and strength plans that ramp with you' },
  { icon: 'sparkles-outline', text: 'Tested meal suggestions and Coach check-ins' },
  { icon: 'heart-outline', text: 'Apple Health and Health Connect sync' },
] as const;

export default function Plus() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { session } = useAuth();
  const billing = useBilling();
  const [items, setItems] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const privacy = legalUrl(config.privacyUrl), terms = legalUrl(config.termsUrl);
  const plans = useMemo(() => orderPlans(items), [items]);
  const choice = plans.find((item) => item.identifier === selected) ?? plans[0];
  const savings = annualSavings(plans);
  const canBuy = !!privacy && !!terms && billing.status.enforced && !busy;
  useEffect(() => {
    let live = true;
    if (session && Platform.OS !== 'web') {
      void storePackages(session.user.id).then((result) => {
        if (live) { setItems(result); if (!result.length) setNote('Buko Plus is not available from the store yet.'); }
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
      setNote('Done. If Plus does not show as active, tap Refresh access.');
    } catch (err) {
      setError(err && typeof err === 'object' && 'userCancelled' in err && err.userCancelled
        ? 'Purchase cancelled. You were not charged.'
        : err instanceof Error ? err.message : 'Store transaction failed. Please retry.');
    } finally { setBusy(false); }
  }
  async function open(url: string) {
    try { await Linking.openURL(url); } catch { setError('Could not open the link. Try your device browser.'); }
  }
  return <Screen>
    <HeroCard>
      <Eyebrow onHero>Buko Plus</Eyebrow>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.onHero, marginTop: spacing.xs }]}>{paywallHeadline(from)}</Text>
      <Text style={[typography.small, { color: colors.onHeroMuted, marginTop: spacing.xs, marginBottom: spacing.md }]}>
        Tell Buko your goal and your days. It plans the meals and the training, and you just follow along.
      </Text>
      {PLUS.map((row) => <View key={row.text} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.sm }}>
        <Ionicons name={row.icon} size={18} color={colors.heroAccent} />
        <Text style={[typography.body, { color: colors.onHero, flex: 1 }]}>{row.text}</Text>
      </View>)}
    </HeroCard>

    {billing.status.premium ? <Notice tone="info">Buko Plus is active{billing.status.expiresAt ? ` until ${new Date(billing.status.expiresAt).toLocaleDateString()}` : ''}{billing.status.sandbox ? ' (sandbox)' : ''}. Thank you!</Notice>
      : !billing.status.enforced ? <Notice tone="info">Beta: Plus features are unlocked for everyone while we test.</Notice> : null}

    {!billing.status.premium ? <Card>
      {Platform.OS === 'web' ? <Body>Start your free trial in the Buko app on iPhone or Android with this account. Plus then unlocks here too.</Body> : <>
        {plans.map((item) => {
          const active = item.identifier === choice?.identifier;
          const annual = item.packageType === 'ANNUAL';
          const trial = freeTrialText(item.product.introPrice);
          return <Pressable key={item.identifier} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setSelected(item.identifier)}
            style={{ borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface,
              borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? colors.primary : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={typography.subheading}>{annual ? 'Yearly' : 'Monthly'}{annual && savings ? `  ·  Save ${savings}%` : ''}</Text>
              <Text style={typography.small}>{item.product.priceString} / {annual ? 'year' : 'month'}{annual && perMonth(item) ? ` (${perMonth(item)}/mo)` : ''}{trial ? `  ·  ${trial}` : ''}</Text>
            </View>
          </Pressable>;
        })}
        {choice ? <>
          <Button title={ctaTitle(choice)} icon="sparkles-outline" loading={busy} disabled={!canBuy} onPress={() => { void transact(choice); }} />
          <Body muted>{renewalText(choice)}</Body>
        </> : null}
        {!privacy || !terms ? <Notice tone="warning">Purchases open once the privacy policy and terms are published.</Notice> : null}
      </>}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {note ? <Notice tone="info">{note}</Notice> : null}
    </Card> : null}

    <Card>
      <Body muted>Always free: food diary, barcode scanning, food scores, manual meal planning, recipes, workout logging and grocery lists. No ads, ever.</Body>
    </Card>

    <Disclosure title="Restore, manage or cancel">
      <Button title="Restore purchases" variant="secondary" disabled={busy || Platform.OS === 'web'} onPress={() => { void transact(); }} />
      <Button title="Refresh access" variant="secondary" loading={billing.loading} onPress={() => { void billing.refresh(true); }} />
      {billing.error ? <Notice tone="warning">{billing.error}</Notice> : null}
      <SubscriptionManagement />
      <Body muted>RevenueCat processes a pseudonymous account ID and purchase/device metadata, not your food, health records or chat.</Body>
      {privacy ? <Button title="Privacy policy" variant="ghost" onPress={() => { void open(privacy); }} /> : null}
      {terms ? <Button title="Terms of service" variant="ghost" onPress={() => { void open(terms); }} /> : null}
    </Disclosure>
  </Screen>;
}
