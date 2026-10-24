import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Platform, Pressable } from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { colors } from '../theme';

export function BackButton({ fallback = '/(tabs)', useHistory = true }: { fallback?: Href; useHistory?: boolean }) {
  const router = useRouter();
  const { session } = useAuth();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityHint="Return to the previous screen"
      onPress={() => {
        if (useHistory && router.canGoBack()) router.back();
        else router.replace(session ? fallback : '/(auth)/sign-in');
      }}
      style={({ pressed }) => ({
        width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
      })}>
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={colors.primary} />
    </Pressable>
  );
}
