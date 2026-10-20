import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Attribution } from '../src/components/Attribution';
import { Body, Button, Card, Heading, Notice, Screen } from '../src/components/ui';
import { CALORIE_FLOOR } from '../src/lib/nutrition/targets';
import { formatHeight, formatWeight } from '../src/lib/units';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import { useProfile } from '../src/providers/ProfileProvider';
import { colors, spacing, typography } from '../src/theme';

const GOAL = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain weight' } as const;

export default function Profile() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, targets } = useProfile();

  return (
    <Screen edges={[]}>
      <Heading>{session?.user.email}</Heading>
      <View style={{ height: spacing.lg }} />

      {targets ? (
        <Card>
          <Text style={typography.label}>Daily targets</Text>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.primary }}>{targets.calories.toLocaleString()} kcal</Text>
          <Body muted>Protein {targets.protein_g} g · Carbs {targets.carbs_g} g · Fat {targets.fat_g} g</Body>
        </Card>
      ) : null}
      {targets?.floor_applied && profile ? (
        <Notice tone="danger">
          Your calculated target was below {CALORIE_FLOOR[profile.sex].toLocaleString()} kcal, the minimum we consider safe without medical supervision, so it was raised to that level. Please talk to a doctor or dietitian before dieting aggressively.
        </Notice>
      ) : null}

      {profile ? (
        <Card>
          <Text style={typography.label}>Your details</Text>
          <Body>{GOAL[profile.goal]} · {formatHeight(profile.height_cm, profile.units)} · {formatWeight(profile.weight_kg, profile.units)}</Body>
          {profile.diet_prefs.length ? <Body muted>Diet: {profile.diet_prefs.map((d) => d.replace('_', '-')).join(', ')}</Body> : null}
          <Button title="Update details & recalculate" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>Health & activity</Text>
        <Body muted>Adjust your calorie target for activity, and connect Apple Health or Health Connect. Each connection is optional and off until you turn it on.</Body>
        <Button title="Health & activity settings" variant="secondary" onPress={() => router.push('/health')} />
      </Card>

      <Card>
        <Text style={typography.label}>Privacy</Text>
        <Body muted>Buko has no ads, analytics or trackers. Your data is stored in your private account; the only things sent elsewhere are anonymous food lookups. Health data from Apple Health or Health Connect is never used for advertising and never shared with third parties.</Body>
      </Card>

      <Button title="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} />
      <Attribution usda />
    </Screen>
  );
}
