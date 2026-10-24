import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Attribution } from '../src/components/Attribution';
import { Body, Button, Card, Disclosure, Heading, NavigationRow, Notice, Screen } from '../src/components/ui';
import { CALORIE_FLOOR } from '../src/lib/nutrition/targets';
import { formatHeight, formatWeight } from '../src/lib/units';
import { signOutSafely } from '../src/lib/recovery';
import { useAuth } from '../src/providers/AuthProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { useSettings } from '../src/providers/SettingsProvider';
import { colors, spacing, typography } from '../src/theme';
import { RecipeAdminLink } from '../src/components/RecipeAdminLink';

const GOAL = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' } as const;

export default function Profile() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, targets, age, birthdayError } = useProfile();
  const { settings } = useSettings();
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={[]}>
      <Heading>Your profile</Heading>
      <Text style={typography.small}>{session?.user.email}</Text>
      <View style={{ height: spacing.lg }} />
      {birthdayError ? <Notice tone="danger">{birthdayError}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {targets?.floor_applied && profile ? (
        <Notice tone="danger">
          Your calculated target was below {CALORIE_FLOOR[profile.sex].toLocaleString()} kcal, the minimum we consider safe without medical supervision, so it was raised to that level. Please talk to a doctor or dietitian before dieting aggressively.
        </Notice>
      ) : null}

      {targets ? (
        <Card>
          <Text style={typography.label}>Daily targets</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary }}>{targets.calories.toLocaleString()} kcal</Text>
          <Body muted>Protein {targets.protein_g} g · Carbs {targets.carbs_g} g · Fat {targets.fat_g} g</Body>
          <Disclosure title="How these targets work">
            <Body muted>Formula-based targets. {settings?.activity_adjust ? 'Diary uses a sedentary baseline plus your chosen share of activity instead.' : 'Your activity preference is included in this estimate.'}</Body>
          </Disclosure>
        </Card>
      ) : null}
      {profile ? (
        <Card>
          <Disclosure title="Your current details">
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
          </Disclosure>
        </Card>
      ) : null}
      <Card>
        <Text style={typography.label}>Personalize Buko</Text>
        <NavigationRow title="Goals & personal details" subtitle="Nutrition goals, units and dietary preferences" icon="person-outline" onPress={() => router.push('/edit-profile')} />
        <NavigationRow title="Health connections" subtitle="Permissions, activity adjustment and sync" icon="heart-outline" onPress={() => router.push('/health')} />
        <NavigationRow title="Coach preferences" subtitle="Weekly review, consent and chat history" icon="chatbubbles-outline" onPress={() => router.push('/coach')} />
        <NavigationRow title="Taste preferences" subtitle="Cuisines, heat, cooking time and optional AI recipe sharing" icon="restaurant-outline" onPress={() => router.push('/recipe/taste')} />
      </Card>
      <RecipeAdminLink />
      <Card>
        <Text style={typography.label}>Account & privacy</Text>
        <NavigationRow title="Account & data" subtitle="Export your data or delete your account" icon="shield-checkmark-outline" onPress={() => router.push('/account')} />
        <NavigationRow title="Subscription" subtitle="Premium, restore and manage" icon="card-outline" onPress={() => router.push('/premium')} />
        <NavigationRow title="Privacy & diagnostics" subtitle="Your choices and how data is used" icon="lock-closed-outline" onPress={() => router.push({ pathname: '/settings', params: { section: 'privacy' } })} />
        <NavigationRow title="Help & about" subtitle="Quick guide, documents and data sources" icon="help-circle-outline" onPress={() => router.push({ pathname: '/settings', params: { section: 'help' } })} />
      </Card>
      <Card>
        <Text style={typography.label}>Progress</Text>
        <NavigationRow title="Weight & measurements" icon="body-outline" onPress={() => router.push('/body')} />
        <NavigationRow title="Training progress" icon="stats-chart-outline" onPress={() => router.push('/progress')} />
      </Card>

      <Button title="Sign out" variant="ghost" onPress={() => {
        void signOutSafely().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not sign out. Please retry.'));
      }} />
      <Attribution usda />
    </Screen>
  );
}
