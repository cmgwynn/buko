import { Text, View } from 'react-native';
import type { Factor } from '../lib/scoring';
import { colors, radius, spacing, typography } from '../theme';
import { SourceLink } from './Attribution';
import { Body, Card } from './ui';

/** One explainable factor of a health score: sub-score, weight, plain-English reason, and its named source. */
export function FactorCard({ factor, totalWeight }: { factor: Factor; totalWeight: number }) {
  const known = factor.points !== null;
  const color = !known ? colors.score.unknown : factor.points! >= 75 ? colors.score.excellent : factor.points! >= 50 ? colors.score.good : factor.points! >= 25 ? colors.score.mediocre : colors.score.poor;
  return (
    <Card style={{ opacity: known ? 1 : 0.75 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.subheading}>{factor.label}</Text>
        <Text style={[typography.subheading, { color }]}>{known ? `${factor.points}/100` : '–'}</Text>
      </View>
      <Text style={[typography.small, { marginBottom: spacing.sm }]}>
        {factor.value} · {Math.round((factor.weight / totalWeight) * 100)}% of the score
      </Text>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginBottom: spacing.sm }}>
        <View style={{ height: 6, width: `${factor.points ?? 0}%`, backgroundColor: color }} />
      </View>
      <Body>{factor.explanation}</Body>
      <View style={{ marginTop: spacing.sm }}><SourceLink name={factor.source.name} url={factor.source.url} /></View>
    </Card>
  );
}
