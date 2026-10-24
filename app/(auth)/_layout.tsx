import { Stack } from 'expo-router';
import { BackButton } from '../../src/components/BackButton';
import { colors } from '../../src/theme';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="sign-in" />
    <Stack.Screen name="sign-up" options={{
      headerShown: true, title: 'Create account', headerTitleAlign: 'center',
      headerStyle: { backgroundColor: colors.background }, headerTitleStyle: { color: colors.text },
      headerShadowVisible: false, headerBackVisible: false,
      headerLeft: () => <BackButton fallback="/(auth)/sign-in" />,
    }} />
  </Stack>;
}
