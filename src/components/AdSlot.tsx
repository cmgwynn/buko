import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { adMode, type AdPlacement } from '../lib/ads/policy';
import { config } from '../lib/config';
import { useWorkoutSession } from '../lib/fitness/session';
import { useBilling } from '../providers/BillingProvider';
import { colors, spacing, typography } from '../theme';
import { Card, MotionPressable } from './ui';

export function AdSlot({ placement }: { placement: AdPlacement }) {
  const router = useRouter();
  const billing = useBilling();
  const workout = useWorkoutSession();
  const mode = adMode({ enabled: config.adsEnabled, plus: billing.status.premium, placement, workoutActive: workout.active });
  if (mode === 'none') return null;
  return <MotionPressable accessibilityRole="button" accessibilityLabel="Sponsored: Go ad-free with Buko Plus" onPress={() => router.push('/premium')}>
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text style={typography.small}>Go ad-free with Buko Plus · Coach, smarter suggestions and health sync.</Text>
        <Text style={[typography.small, { color: colors.textMuted }]}>Ad</Text>
      </View>
    </Card>
  </MotionPressable>;
}
