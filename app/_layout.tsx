import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Body, Button, Card, Heading, Loading, Notice, Screen } from '../src/components/ui';
import { isSupabaseConfigured } from '../src/lib/config';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { ProfileProvider, useProfile } from '../src/providers/ProfileProvider';
import { SettingsProvider } from '../src/providers/SettingsProvider';
import { BillingProvider } from '../src/providers/BillingProvider';
import { SelectedDateProvider } from '../src/providers/SelectedDateProvider';
import { DiagnosticBoundary, DiagnosticLifecycle } from '../src/components/DiagnosticBoundary';
import { BackButton } from '../src/components/BackButton';
import { ConfirmProvider } from '../src/components/ConfirmProvider';
import { WorkoutWebOffline } from '../src/components/workout/WorkoutWebOffline';
import { WorkoutModeProvider } from '../src/providers/WorkoutModeProvider';
import { colors, layout, spacing } from '../src/theme';

const headerOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text },
  headerTitleAlign: 'center',
  headerBackVisible: false,
  headerLeft: () => <BackButton />,
  headerBackTitle: 'Back',
} as const;

const recipeHeaderOptions = {
  ...headerOptions,
  headerLeft: () => <BackButton fallback="/(tabs)/recipes" />,
};

const workoutHeaderOptions = {
  ...headerOptions,
  headerLeft: () => <BackButton fallback="/(tabs)/train" />,
};
const communityHeaderOptions = {
  ...headerOptions,
  headerLeft: () => <BackButton fallback="/community" />,
};

function Gate() {
  const { session, loading, sessionError } = useAuth();
  const { profile, loading: profileLoading, connectionError, refresh } = useProfile();
  if (loading || profileLoading) return <Loading />;
  if (session && !profile && connectionError) return <Screen><Notice tone="danger">{connectionError}</Notice><Button title="Retry profile" onPress={() => { void refresh(); }} /></Screen>;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile;

  return (
    <>
    {sessionError ? <Notice tone={session ? 'info' : 'danger'}>{sessionError}</Notice> : null}
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
        <Stack.Screen name="log/manual" options={{ ...headerOptions, title: 'Enter nutrition' }} />
        <Stack.Screen name="edit-profile" options={{ ...headerOptions, title: 'Update details' }} />
        <Stack.Screen name="profile" options={{ ...headerOptions, title: 'Profile' }} />
        <Stack.Screen name="settings" options={{ ...headerOptions, title: 'Settings' }} />
        <Stack.Screen name="coach" options={{ ...headerOptions, title: 'Coach' }} />
        <Stack.Screen name="recipe/[id]" options={{ ...recipeHeaderOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/edit" options={{ ...recipeHeaderOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/import" options={{ ...recipeHeaderOptions, title: 'Import recipe' }} />
        <Stack.Screen name="recipe/library" options={{ ...recipeHeaderOptions, title: 'Recipe library' }} />
        <Stack.Screen name="recipe/suggest" options={{ ...recipeHeaderOptions, title: 'Find a tested meal' }} />
        <Stack.Screen name="recipe/taste" options={{ ...recipeHeaderOptions, title: 'Taste preferences' }} />
        <Stack.Screen name="recipe/admin" options={{ ...recipeHeaderOptions, title: 'Recipe quality' }} />
        <Stack.Screen name="community/index" options={{ ...recipeHeaderOptions, title: 'Shared recipes' }} />
        <Stack.Screen name="community/[id]" options={{ ...communityHeaderOptions, title: 'Shared recipe' }} />
        <Stack.Screen name="community/publish" options={{ ...communityHeaderOptions, title: 'Share a recipe' }} />
        <Stack.Screen name="community/moderation" options={{ ...communityHeaderOptions, title: 'Recipe reports' }} />
        <Stack.Screen name="recipe/match" options={{ ...recipeHeaderOptions, title: 'Match ingredient' }} />
        <Stack.Screen name="cook/[id]" options={{ ...recipeHeaderOptions, title: 'Cooking', gestureEnabled: false }} />
        <Stack.Screen name="cook/finish" options={{ ...recipeHeaderOptions, title: 'Log meal', gestureEnabled: false }} />
        <Stack.Screen name="grocery/generate" options={{ ...headerOptions, title: 'Grocery list from plan' }} />
        <Stack.Screen name="pantry" options={{ ...headerOptions, title: 'Pantry' }} />
        <Stack.Screen name="workout/start" options={{ ...workoutHeaderOptions, title: 'Start workout' }} />
        <Stack.Screen name="workout/active" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="workout/finish" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="workout/exercises" options={{ ...workoutHeaderOptions, title: 'Exercises' }} />
        <Stack.Screen name="workout/[id]" options={{ ...workoutHeaderOptions, title: 'Workout' }} />
        <Stack.Screen name="workout/library" options={{ ...workoutHeaderOptions, title: 'Workout library' }} />
        <Stack.Screen name="routine/edit" options={{ ...workoutHeaderOptions, title: 'Routine' }} />
        <Stack.Screen name="exercise/[id]" options={{ ...workoutHeaderOptions, title: 'Exercise' }} />
        <Stack.Screen name="progress" options={{ ...workoutHeaderOptions, title: 'Progress' }} />
        <Stack.Screen name="body" options={{ ...workoutHeaderOptions, title: 'Log body stats' }} />
        <Stack.Screen name="health" options={{ ...workoutHeaderOptions, title: 'Health & activity' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="account" options={{ ...headerOptions, title: 'Your account & data' }} />
        <Stack.Screen name="premium" options={{ ...headerOptions, title: 'Buko Premium' }} />
      </Stack.Protected>
      <Stack.Screen name="delete-account" options={{ ...headerOptions, title: 'Delete your account' }} />
    </Stack>
    </>
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
          <SelectedDateProvider>
          <ProfileProvider>
            <SettingsProvider>
              <BillingProvider>
              <DiagnosticLifecycle />
              <DiagnosticBoundary>
              <ConfirmProvider>
              <WorkoutModeProvider>
              <WorkoutWebOffline />
              <Gate />
              </WorkoutModeProvider>
              </ConfirmProvider>
              </DiagnosticBoundary>
              </BillingProvider>
            </SettingsProvider>
          </ProfileProvider>
          </SelectedDateProvider>
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
      </View>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
