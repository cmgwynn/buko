import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Attribution } from '../src/components/Attribution';
import { Body, Button, Card, CardGrid, Heading, Notice, Screen } from '../src/components/ui';
import { CALORIE_FLOOR } from '../src/lib/nutrition/targets';
import { formatHeight, formatWeight } from '../src/lib/units';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { useSettings } from '../src/providers/SettingsProvider';
import { colors, spacing, typography } from '../src/theme';

const GOAL = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' } as const;

export default function Profile() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, targets, age, birthdayError } = useProfile();
  const { settings, update } = useSettings();
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  async function activity(on: boolean) {
    setUpdating(true);
    const err = await update({ activity_adjust: on });
    setError(err); setUpdating(false);
  }

  return (
    <Screen edges={[]}>
      <Heading>Your health, your way</Heading>
      <Text style={typography.small}>{session?.user.email}</Text>
      <View style={{ height: spacing.lg }} />
      {birthdayError ? <Notice tone="danger">{birthdayError}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {targets?.floor_applied && profile ? (
        <Notice tone="danger">
          Your calculated target was below {CALORIE_FLOOR[profile.sex].toLocaleString()} kcal, the minimum we consider safe without medical supervision, so it was raised to that level. Please talk to a doctor or dietitian before dieting aggressively.
        </Notice>
      ) : null}

      <CardGrid>
      {targets ? (
        <Card>
          <Text style={typography.label}>Daily targets</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary }}>{targets.calories.toLocaleString()} kcal</Text>
          <Body muted>Protein {targets.protein_g} g · Carbs {targets.carbs_g} g · Fat {targets.fat_g} g</Body>
          <Body muted>Formula-based targets. {settings?.activity_adjust ? 'Diary uses a sedentary baseline plus your chosen share of activity instead.' : 'Your activity preference is included in this estimate.'}</Body>
        </Card>
      ) : null}
      {profile ? (
        <Card>
          <Text style={typography.label}>Your details</Text>
          <Body>{GOAL[profile.goal]} · {formatHeight(profile.height_cm, profile.units)} · {formatWeight(profile.weight_kg, profile.units)}</Body>
          {profile.birth_date ? (
            <>
              <Body muted>Birthday: {new Date(`${profile.birth_date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Age {age ?? 'unavailable'}</Body>
              <Body muted>Your age and formula-based targets update automatically on your birthday.</Body>
            </>
          ) : (
            <Body muted>Age: approximately {age}. Add your birthday in Update details to keep your age and formula-based targets accurate automatically.</Body>
          )}
          {profile.diet_prefs.length ? <Body muted>Diet: {profile.diet_prefs.map((d) => d.replace('_', '-')).join(', ')}</Body> : null}
          <Button title="Edit goals & personal details" icon="create-outline" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </Card>
      ) : null}
      </CardGrid>

      <Card>
        <Text style={typography.label}>Daily support</Text>
        <Button title="Settings, privacy & account" icon="settings-outline" variant="secondary" onPress={() => router.push('/settings')} />
        <Button title="Coach, weekly review & preferences" icon="chatbubbles-outline" variant="secondary" onPress={() => router.push('/coach')} />
        <Button title="Weight & measurements" icon="body-outline" variant="ghost" onPress={() => router.push('/body')} />
        <Button title="Training progress" icon="stats-chart-outline" variant="ghost" onPress={() => router.push('/progress')} />
      </Card>
      <Card>
        <Text style={typography.label}>Activity & connections</Text>
        {settings ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md }}>
            <View style={{ flex: 1 }}><Body>Adjust Diary target for activity</Body><Body muted>Uses a sedentary baseline plus {Math.round(settings.activity_share * 100)}% of logged active calories, avoiding double counting.</Body></View>
            <Switch accessibilityLabel="Adjust Diary target for activity" value={settings.activity_adjust} disabled={updating} onValueChange={activity} />
          </View>
        ) : null}
        <Button title="Manage health connections & activity share" variant="ghost" onPress={() => router.push('/health')} />
      </Card>

      <Card>
        <Button title={privacyOpen ? 'Hide privacy & account information' : 'Privacy & account information'} variant="ghost" onPress={() => setPrivacyOpen(!privacyOpen)} />
        {privacyOpen ? <>
          <Body muted>Buko has no ads, analytics or trackers. Your account data is protected by owner-only database policies. Public food lookups go to Open Food Facts and USDA. Recipe URL imports fetch the site you choose, without Buko account credentials.</Body>
          <Body muted>Coach is optional and off until you agree. When activated, minimized context and chat may be sent to Anthropic. Names, email and birthday are excluded from structured AI context; avoid identifiers in free text. Imported health-app workouts/active energy are excluded. Weight trend sharing is separate and off by default. Manage consent and delete conversations in Coach preferences.</Body>
          <Body muted>Store subscriptions use RevenueCat with a pseudonymous account identifier and purchase/device metadata. Optional diagnostic signals exclude account identifiers and health content. Manage these features and export/delete account data in Settings.</Body>
          <Button title="Manage Coach privacy" variant="secondary" onPress={() => router.push('/coach')} />
        </> : null}
      </Card>

      <Button title="Sign out" variant="ghost" onPress={() => { void supabase.auth.signOut().then(({ error: e }) => { if (e) setError(e.message); }); }} />
      <Attribution usda />
    </Screen>
  );
}
