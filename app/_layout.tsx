import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Linking, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Body, Card, Heading, Loading, Screen } from '../src/components/ui';
import { isSupabaseConfigured } from '../src/lib/config';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { ProfileProvider, useProfile } from '../src/providers/ProfileProvider';
import { colors, spacing } from '../src/theme';

const headerOptions = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { color: colors.text },
  headerBackTitle: 'Back',
} as const;

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
        <Stack.Screen name="recipe/[id]" options={{ ...headerOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/edit" options={{ ...headerOptions, title: 'Recipe' }} />
        <Stack.Screen name="recipe/import" options={{ ...headerOptions, title: 'Import recipe' }} />
        <Stack.Screen name="recipe/match" options={{ ...headerOptions, title: 'Match ingredient' }} />
        <Stack.Screen name="cook/[id]" options={{ ...headerOptions, title: 'Cooking', gestureEnabled: false }} />
        <Stack.Screen name="cook/finish" options={{ ...headerOptions, title: 'Log meal', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="grocery/generate" options={{ ...headerOptions, title: 'Grocery list from plan' }} />
        <Stack.Screen name="pantry" options={{ ...headerOptions, title: 'Pantry' }} />
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
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isSupabaseConfigured ? (
        <AuthProvider>
          <ProfileProvider>
            <Gate />
          </ProfileProvider>
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
