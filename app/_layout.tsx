import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Body, Card, Heading, Loading, Screen } from '../src/components/ui';
import { isSupabaseConfigured } from '../src/lib/config';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { ProfileProvider, useProfile } from '../src/providers/ProfileProvider';
import { SettingsProvider } from '../src/providers/SettingsProvider';
import { colors, layout, spacing } from '../src/theme';

const headerOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text },
  headerBackTitle: 'Back',
} as const;

const recipeHeaderOptions = {
  ...headerOptions,
  headerRight: () => (
    <Link href="/(tabs)/recipes" dismissTo accessibilityLabel="Back to recipes"
      style={{ color: colors.primary, fontSize: 15, fontWeight: '600', padding: spacing.sm }}>
      Recipes
    </Link>
  ),
};

const workoutHeaderOptions = {
  ...headerOptions,
  headerRight: () => (
    <Link href="/(tabs)/train" dismissTo accessibilityLabel="Back to Train"
      style={{ color: colors.primary, fontSize: 15, fontWeight: '600', padding: spacing.sm }}>
      Train
    </Link>
  ),
};

function Gate() {
  const { session, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  if (loading || profileLoading) return <Loading />;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[barcode]" options={{ ...headerOptions, title: 'Product' }} />
        <Stack.Screen name="log/search" options={{ ...headerOptions, title: 'Add food' }} />
        <Stack.Screen name="log/scan" options={{ ...headerOptions, title: 'Scan to log' }} />
        <Stack.Screen name="log/recipes" options={{ ...headerOptions, title: 'Log a recipe' }} />
        <Stack.Screen name="log/add" options={{ ...headerOptions, title: 'Log food' }} />
        <Stack.Screen name="edit-profile" options={{ ...headerOptions, title: 'Update details' }} />
        <Stack.Screen name="profile" options={{ ...headerOptions, title: 'Profile' }} />
        <Stack.Screen name="coach" options={{ ...headerOptions, title: 'Coach' }} />
        <Stack.Screen name="recipe/[id]" options={{ ...recipeHeaderOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/edit" options={{ ...recipeHeaderOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/import" options={{ ...recipeHeaderOptions, title: 'Import recipe' }} />
        <Stack.Screen name="recipe/library" options={{ ...recipeHeaderOptions, title: 'Recipe library' }} />
        <Stack.Screen name="recipe/match" options={{ ...headerOptions, title: 'Match ingredient' }} />
        <Stack.Screen name="cook/[id]" options={{ ...headerOptions, title: 'Cooking', gestureEnabled: false }} />
        <Stack.Screen name="cook/finish" options={{ ...headerOptions, title: 'Log meal', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="grocery/generate" options={{ ...headerOptions, title: 'Grocery list from plan' }} />
        <Stack.Screen name="pantry" options={{ ...headerOptions, title: 'Pantry' }} />
        <Stack.Screen name="workout/active" options={{ ...headerOptions, title: 'Workout', headerBackVisible: true }} />
        <Stack.Screen name="workout/exercises" options={{ ...headerOptions, title: 'Exercises' }} />
        <Stack.Screen name="workout/[id]" options={{ ...workoutHeaderOptions, title: 'Workout' }} />
        <Stack.Screen name="workout/library" options={{ ...workoutHeaderOptions, title: 'Workout library' }} />
        <Stack.Screen name="routine/edit" options={{ ...workoutHeaderOptions, title: 'Routine' }} />
        <Stack.Screen name="exercise/[id]" options={{ ...headerOptions, title: 'Exercise' }} />
        <Stack.Screen name="progress" options={{ ...headerOptions, title: 'Progress' }} />
        <Stack.Screen name="body" options={{ ...headerOptions, title: 'Log body stats' }} />
        <Stack.Screen name="health" options={{ ...headerOptions, title: 'Health & activity' }} />
      </Stack.Protected>
    </Stack>
  );
}

function SetupNeeded() {
  return (
    <Screen>
      <Heading>Almost there</Heading>
      <Card style={{ marginTop: spacing.lg }}>
        <Body>
          Buko can&apos;t find your Supabase settings. Copy <Text style={{ fontWeight: '700' }}>.env.example</Text> to{' '}
          <Text style={{ fontWeight: '700' }}>.env</Text>, fill in your keys, then restart Expo with{' '}
          <Text style={{ fontWeight: '700' }}>npx expo start -c</Text>. See the README for details.
        </Body>
        <Text style={{ color: colors.primary, marginTop: spacing.md }} onPress={() => Linking.openURL('https://supabase.com/dashboard')}>
          Open Supabase dashboard
        </Text>
      </Card>
    </Screen>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surfaceMuted }}>
    <SafeAreaProvider>
      <View style={{ flex: 1, width: '100%', maxWidth: layout.appMaxWidth, alignSelf: 'center', backgroundColor: colors.background }}>
      <StatusBar style="dark" />
      {isSupabaseConfigured ? (
        <AuthProvider>
          <ProfileProvider>
            <SettingsProvider>
              <Gate />
            </SettingsProvider>
          </ProfileProvider>
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
      </View>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
