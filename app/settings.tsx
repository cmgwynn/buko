import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Attribution } from '../src/components/Attribution';
import { Body, Button, Card, Disclosure, Heading, NavigationRow, Notice, Screen } from '../src/components/ui';
import { config } from '../src/lib/config';
import { legalUrl } from '../src/lib/legal';
import { loadDiagnosticConsent, saveDiagnosticConsent } from '../src/lib/diagnostics/client';
import { loadUsageOptOut, saveUsageOptOut } from '../src/lib/trial/client';
import { useAuth } from '../src/providers/AuthProvider';
import { spacing } from '../src/theme';
const adsCopy = config.adsEnabled
  ? 'The free version may show non-personalized ads that never use your health data. Buko Plus removes them.'
  : 'No ads.';
export default function Settings() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const { session } = useAuth();
  const [diagnostics, setDiagnostics] = useState(false);
  const [counting, setCounting] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (session) void loadUsageOptOut(session.user.id).then((out) => { if (live) setCounting(!out); }).catch(() => {});
    if (session) void loadDiagnosticConsent(session.user.id).then((value) => { if (live) setDiagnostics(value); })
      .catch(() => { if (live) setError('Could not load your diagnostic preference. Reporting stays off.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [session?.user.id]);
  async function toggle(value: boolean) {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try { await saveDiagnosticConsent(session.user.id, value); setDiagnostics(value); }
    catch { setError('Could not save the diagnostic preference. Please retry.'); }
    finally { setBusy(false); }
  }
  async function toggleCounting(value: boolean) {
    if (!session) return;
    setCounting(value);
    try { await saveUsageOptOut(session.user.id, !value); }
    catch { setCounting(!value); setError('Could not save the usage-count preference. Please retry.'); }
  }
  async function open(value: string) {
    const url = legalUrl(value);
    if (!url) { setError('The app owner has not published this document yet. It must be available before launch.'); return; }
    try { await Linking.openURL(url); } catch { setError('Could not open the document. Try your browser.'); }
  }
  return <Screen>
    <Heading>{section === 'help' ? 'Help & about' : 'Settings & privacy'}</Heading>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {section !== 'help' ? <>
    <Card><Heading>Account & subscription</Heading>
      <NavigationRow title="Account & data" subtitle="Export data or delete account" onPress={() => router.push('/account')} />
      <NavigationRow title="Subscription" subtitle="Buko Plus, restore and manage" onPress={() => router.push('/premium')} />
      <Body muted>Account deletion does not cancel store subscriptions. Manage your store subscription before deleting.</Body>
    </Card>
    <Card><Heading>Your choices</Heading>
      <NavigationRow title="Coach consent & history" onPress={() => router.push('/coach')} />
      <NavigationRow title="Health connections" onPress={() => router.push('/health')} />
      <NavigationRow title="Goals, units & dietary preferences" onPress={() => router.push('/edit-profile')} />
    </Card>
    <Card><Heading>Optional diagnostics</Heading>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Body>Share limited crash signals</Body><Body muted>Off by default. No health content or account identifiers are forwarded.</Body></View>
        <Switch accessibilityLabel="Share limited crash signals" disabled={busy} value={diagnostics} onValueChange={(value) => { void toggle(value); }} />
      </View>
      <Disclosure title="What diagnostic reports contain">
        <Body muted>Off by default, per account on this device. Sends a fixed error category, platform and app release through Supabase to the configured crash service. No raw messages, stacks, health values, chat, screenshots, breadcrumbs or user IDs are forwarded.</Body>
        <Body muted>Automatic native crash dumps and session replay are disabled. Network providers process connection metadata; Supabase receives your authenticated request, while the crash service sees the relay connection. Reporting requires owner configuration.</Body>
      </Disclosure>
    </Card>
    <Card><Heading>Anonymous usage counts</Heading>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Body>Count my daily visit</Body><Body muted>Adds one to a daily total by platform and sign-up week. No account ID or content.</Body></View>
        <Switch accessibilityLabel="Count my daily visit" value={counting} onValueChange={(value) => { void toggleCounting(value); }} />
      </View>
    </Card>
    <Card><Disclosure title="Privacy & data processing">
      <Body muted>{adsCopy} No behavioral analytics or trackers. Account data is protected by owner-only database policies. Public food lookups go to Open Food Facts and USDA. Recipe URL imports fetch your chosen site without Buko credentials. Order on Instacart sends only your unchecked grocery item names, and Buko may earn a commission.</Body>
      <Body muted>Coach is optional. With consent, minimized context and chat may go to Anthropic; names, email and birthday are excluded from structured context. Avoid identifiers in free text. Imported health-app workouts and energy are excluded; weight sharing is a separate choice.</Body>
      <Body muted>Store subscriptions use RevenueCat with a pseudonymous identifier and purchase/device metadata. Exported files contain sensitive personal and health data. Deletion does not remove original Apple Health or Health Connect records.</Body>
    </Disclosure></Card>
    </> : null}
    {section === 'help' ? <Card><Heading>Getting around</Heading>
      <Body>Diary: log food with Search, Scan, Recipes or Recent. Plan: choose a day and meal, then find a recipe. Groceries: generate a list from selected meals or add items yourself. Train: start or resume a workout.</Body>
      <Disclosure title="Scores and nutrition estimates"><Body muted>Nutrition scores describe listed ingredients, not medical suitability. Missing nutrition is not zero. Member stars describe the recipe experience, not its nutritional quality. Check ingredient labels for allergies and cross-contact.</Body></Disclosure>
      <Disclosure title="Saving and recovery"><Body muted>Recipe drafts and unfinished workouts are kept temporarily on this device for your account. They are not a server backup. Completed actions need a successful save. Sign-out clears recoverable work on this device.</Body></Disclosure>
    </Card>
    : null}
    <Card><Heading>Legal & data sources</Heading>
      <Button title="Privacy policy" variant="ghost" onPress={() => { void open(config.privacyUrl); }} />
      <Button title="Terms of service" variant="ghost" onPress={() => { void open(config.termsUrl); }} />
      <Body muted>{adsCopy} No behavioral analytics. Optional RevenueCat purchases, Coach and diagnostics involve additional processors as disclosed in their screens. Public food lookups use Open Food Facts and USDA.</Body>
      <Attribution usda />
      <Button title="Open Food Facts database license (ODbL)" variant="ghost" onPress={() => { void open('https://opendatacommons.org/licenses/odbl/1-0/'); }} />
    </Card>
  </Screen>;
}
