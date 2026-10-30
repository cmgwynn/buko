import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Switch, Text, View } from 'react-native';
import { Button, Card, Chip, ChipRow, Notice, Screen } from '../src/components/ui';
import { useRouter } from 'expo-router';
import { useBilling } from '../src/providers/BillingProvider';
import { FEATURES, getAdapter, healthAppName, syncIfDue } from '../src/lib/health';
import type { UserSettings } from '../src/lib/fitness/types';
import { useAuth } from '../src/providers/AuthProvider';
import { useSettings } from '../src/providers/SettingsProvider';
import { colors, spacing, typography } from '../src/theme';

export default function HealthSettings() {
  const router = useRouter();
  const billing = useBilling();
  const { session } = useAuth();
  const { settings, update } = useSettings();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const app = healthAppName();

  useEffect(() => {
    const a = getAdapter();
    if (!a) return setAvailable(false);
    a.isAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  if (!settings) return null;

  async function setFlag(patch: Partial<Omit<UserSettings, 'user_id'>>) {
    const err = await update(patch);
    if (err) setMessage(err);
  }

  function toggleFeature(f: (typeof FEATURES)[number], on: boolean) {
    setMessage(null);
    if (!on) {
      setFlag({ [f.setting]: false });
      return;
    }
    if (!billing.allowed) { router.push({ pathname: '/premium', params: { from: 'health' } }); return; }
    // Explain first; the system permission prompt appears only after the user agrees.
    Alert.alert(f.title, `${f.why}\n\n${app} will now ask you to allow this. You can change it any time in ${Platform.OS === 'ios' ? 'Settings › Health' : 'Health Connect'}.`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Continue',
        onPress: async () => {
          const ok = await getAdapter()?.requestFeature(f.key);
          if (!ok) return setMessage(`${app} didn’t grant access, so this stays off.`);
          await setFlag({ [f.setting]: true });
          if (session) syncIfDue(session.user.id, { ...settings!, [f.setting]: true } as UserSettings, true);
        },
      },
    ]);
  }

  return (
    <Screen>
      <Text style={typography.heading}>Calorie target</Text>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: spacing.md }}>
            <Text style={typography.subheading}>Adjust for activity</Text>
            <Text style={typography.small}>
              Adds part of the calories you burn each day to your target on the Diary. Your base target is your goal at a sedentary level, so activity isn’t counted twice.
            </Text>
          </View>
          <Switch value={settings.activity_adjust} onValueChange={(v) => setFlag({ activity_adjust: v })} trackColor={{ true: colors.primary }} />
        </View>
        {settings.activity_adjust ? (
          <>
            <Text style={[typography.label, { marginTop: spacing.md }]}>Share of burned calories to add</Text>
            <ChipRow>
              {[0.25, 0.5, 0.75, 1].map((s) => (
                <Chip key={s} label={`${s * 100}%`} selected={Math.abs(settings.activity_share - s) < 0.01} onPress={() => setFlag({ activity_share: s })} />
              ))}
            </ChipRow>
            <Text style={typography.small}>
              50% is the default because calorie burn estimates tend to run high. Turn this off any time to go back to your normal target.
            </Text>
            {!settings.health_read_active_energy ? (
              <Text style={[typography.small, { marginTop: spacing.sm }]}>Without “Read active calories” below, only workouts you log in Buko count.</Text>
            ) : null}
          </>
        ) : null}
      </Card>

      <Text style={[typography.heading, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>{app}</Text>
      {!billing.allowed ? <Card><Text style={typography.body}>Health integration syncing is paused without Buko Plus. You can still turn existing permissions off.</Text>
        <Button title="See Buko Plus" variant="secondary" onPress={() => router.push('/premium')} /></Card> : null}
      <Notice tone="info">
        Health records are saved only to your private account and are never used for advertising. Imported health-app workouts and active energy are excluded from Coach requests. Optional Coach weight-trend sharing is controlled separately in Coach preferences.
      </Notice>
      {available === false ? (
        <Notice tone="warning">
          {Platform.OS === 'web' ? 'Health access isn’t available on the web.' : `${app} isn’t available in this version of the app. It needs the Buko development build (not Expo Go) on a supported device. See the README.`}
        </Notice>
      ) : null}
      {message ? <Notice tone="warning">{message}</Notice> : null}
      <View style={{ height: spacing.sm }} />
      {FEATURES.map((f) => (
        <Card key={f.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={typography.subheading}>{f.title}</Text>
              <Text style={typography.small}>{f.why}</Text>
            </View>
            <Switch
              value={Boolean(settings[f.setting])}
              disabled={(!available || !billing.allowed) && !settings[f.setting]}
              onValueChange={(v) => toggleFeature(f, v)}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </Card>
      ))}
      <Text style={[typography.small, { marginTop: spacing.sm }]}>
        Turning a switch off stops Buko using that data. To fully revoke access, open {Platform.OS === 'ios' ? 'Settings › Health › Data Access & Devices › Buko' : 'Health Connect › App permissions › Buko'}.
      </Text>
      {Platform.OS !== 'web' ? (
        <Text style={[typography.small, { color: colors.primary, marginTop: spacing.md }]} onPress={() => Linking.openSettings()}>
          Open phone settings
        </Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Text style={[typography.small, { marginTop: spacing.md }]}>
          Note: iOS never tells apps whether read access was granted. If steps or calories show nothing, check Settings › Health › Data Access & Devices › Buko.
        </Text>
      ) : null}
    </Screen>
  );
}
