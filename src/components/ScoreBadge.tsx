import { StyleSheet, Text, View } from 'react-native';
import type { RatingKey } from '../lib/scoring';
import { colors } from '../theme';

export function scoreColor(rating: RatingKey | 'unknown'): string {
  return colors.score[rating];
}

/** Circular 0–100 health score with the rating colour. */
export function ScoreBadge({ score, rating, size = 72 }: { score: number | null; rating: RatingKey | 'unknown'; size?: number }) {
  const color = scoreColor(rating);
  return (
    <View
      accessibilityLabel={score === null ? 'No score' : `Health score ${score} out of 100, ${rating}`}
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, borderColor: color, backgroundColor: color + '1F' }]}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: colors.text }}>{score ?? '–'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
