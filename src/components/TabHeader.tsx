import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { colors, spacing } from '../theme';
import { Title } from './ui';

/** Title row for tab screens, with the Profile button at the top right and an optional extra action. */
export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
      <Title>{title}</Title>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {right}
        <Pressable onPress={() => router.push('/profile')} hitSlop={10} accessibilityLabel="Profile">
          <Ionicons name="person-circle-outline" size={30} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}
