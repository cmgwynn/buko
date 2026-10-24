import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { MotionPressable, Title } from './ui';
import { CoconutLogo } from './CoconutLogo';
import { BackButton } from './BackButton';

/** Title row for tab screens, with the Profile button at the top right and an optional extra action. */
export function TabHeader({ title, right, backFallback }: { title: string; right?: ReactNode; backFallback?: Href }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
        {backFallback ? <BackButton fallback={backFallback} useHistory={false} /> : <CoconutLogo size={32} />}
        <Title>{title}</Title>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {right}
        <MotionPressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile"
          style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person-outline" size={22} color={colors.primary} />
        </MotionPressable>
      </View>
    </View>
  );
}
