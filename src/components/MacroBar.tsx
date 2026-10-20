import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

/** Labelled progress bar: `value` of `target`, turning red-ish when well over target. */
export function MacroBar({ label, value, target, unit = 'g', color }: { label: string; value: number; target: number; unit?: string; color: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const over = target > 0 && value > target * 1.05;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={styles.head}>
        <Text style={typography.label}>{label}</Text>
        <Text style={typography.small}>
          {Math.round(value)} / {Math.round(target)} {unit}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: over ? colors.danger : color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
});
