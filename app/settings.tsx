import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Attribution } from '../src/components/Attribution';
import { Body, Button, Card, Heading, Notice, Screen } from '../src/components/ui';
import { config } from '../src/lib/config';
import { legalUrl } from '../src/lib/legal';
import { loadDiagnosticConsent, saveDiagnosticConsent } from '../src/lib/diagnostics/client';
import { useAuth } from '../src/providers/AuthProvider';
import { spacing } from '../src/theme';
export default function Settings() {
  const router = useRouter();
  const { session } = useAuth();
  const [diagnostics, setDiagnostics] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
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
  async function open(value: string) {
    const url = legalUrl(value);
    if (!url) { setError('The app owner has not published this document yet. It must be available before launch.'); return; }
    try { await Linking.openURL(url); } catch { setError('Could not open the document. Try your browser.'); }
  }
  return <Screen>
    <Heading>Settings & privacy</Heading>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <Card><Heading>Your choices</Heading>
      <Button title="Coach consent, weight sharing & history" variant="secondary" onPress={() => router.push('/coach')} />
      <Button title="Health permissions & connections" variant="secondary" onPress={() => router.push('/health')} />
      <Button title="Goals, units & dietary preferences" variant="ghost" onPress={() => router.push('/edit-profile')} />
    </Card>
    <Card><Heading>Optional diagnostics</Heading>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><Body>Share limited crash signals</Body><Body muted>Off by default, per account on this device. Sends a fixed error category, platform and app release through Supabase to the configured crash service. No raw messages, stacks, health values, chat, screenshots, breadcrumbs or user IDs are forwarded.</Body></View>
        <Switch accessibilityLabel="Share limited crash signals" disabled={busy} value={diagnostics} onValueChange={(value) => { void toggle(value); }} />
      </View>
      <Body muted>Automatic native crash dumps and session replay are disabled. Technical reports cannot diagnose every crash. Network providers still process connection metadata; Supabase receives your authenticated request, while the crash service sees the relay connection rather than your device connection. Reporting requires owner configuration.</Body>
    </Card>
    <Card><Heading>Account & subscription</Heading>
      <Button title="Premium, restore & manage subscription" variant="secondary" onPress={() => router.push('/premium')} />
      <Button title="Export data or delete account" variant="secondary" onPress={() => router.push('/account')} />
      <Body muted>Exported files contain sensitive personal/health data. Store them securely. Account deletion does not cancel store subscriptions or remove original records held in Apple Health or Health Connect.</Body>
    </Card>
    <Card><Heading>Legal & data sources</Heading>
      <Button title="Privacy policy" variant="ghost" onPress={() => { void open(config.privacyUrl); }} />
      <Button title="Terms of service" variant="ghost" onPress={() => { void open(config.termsUrl); }} />
      <Body muted>No ads or behavioral analytics. Optional RevenueCat purchases, Coach and diagnostics involve additional processors as disclosed in their screens. Public food lookups use Open Food Facts and USDA.</Body>
      <Attribution usda />
      <Button title="Open Food Facts database license (ODbL)" variant="ghost" onPress={() => { void open('https://opendatacommons.org/licenses/odbl/1-0/'); }} />
    </Card>
  </Screen>;
}
