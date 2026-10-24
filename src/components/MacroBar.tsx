import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '../theme';

/** Labelled progress bar: logged intake compared with a target, not an error state. */
export function MacroBar({ label, value, target, unit = 'g', color }: { label: string; value: number; target: number; unit?: string; color: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const progress = useSharedValue(pct);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 280, reduceMotion: ReduceMotion.System });
  }, [pct, progress]);
  const animatedStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.head}>
        <Text style={typography.label}>{label}</Text>
        <Text style={typography.small}>
          {Math.round(value)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-valuetext={`${Math.round(value)} of ${Math.round(target)} ${unit}`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100), text: `${Math.round(value)} of ${Math.round(target)} ${unit}` }}>
        <Animated.View style={[styles.fill, animatedStyle, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
});
