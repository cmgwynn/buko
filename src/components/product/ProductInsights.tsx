import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { Factor, RatingKey } from '../../lib/scoring';
import type { Alternative } from '../../lib/api/alternatives';
import type { Nutrients } from '../../types';
import { colors, radius, spacing, typography } from '../../theme';
import { SourceLink } from '../Attribution';
import { ScoreBadge } from '../ScoreBadge';

type IconName = ComponentProps<typeof Ionicons>['name'];

const FACTOR_ICON: Record<Factor['id'], IconName> = {
  nutriscore: 'ribbon-outline', nova: 'construct-outline', additives: 'flask-outline',
  sugar: 'cube-outline', sodium: 'water-outline', saturatedFat: 'egg-outline',
};

export function pointsColor(points: number | null) {
  if (points === null) return colors.score.unknown;
  return points >= 75 ? colors.score.excellent : points >= 50 ? colors.score.good : points >= 25 ? colors.score.mediocre : colors.score.poor;
}

/** A two-to-three word verdict for one factor, in the style of a product label. */
export function factorVerdict(f: Factor): string {
  const p = f.points;
  if (p === null) return 'No data';
  switch (f.id) {
    case 'nutriscore': return p >= 75 ? 'Great nutrition profile' : p >= 50 ? 'Fair nutrition profile' : p >= 25 ? 'Poor nutrition profile' : 'Very poor nutrition profile';
    case 'nova': return p >= 100 ? 'Unprocessed' : p >= 80 ? 'Culinary ingredient' : p >= 50 ? 'Processed' : 'Ultra-processed';
    case 'additives': return p >= 100 ? 'No additives' : p >= 50 ? 'Few additives' : 'Additives to limit';
    case 'sugar': return p >= 75 ? 'Low sugar' : p >= 40 ? 'Some sugar' : 'Too sweet';
    case 'sodium': return p >= 75 ? 'Low salt' : p >= 40 ? 'Some salt' : 'Too salty';
    case 'saturatedFat': return p >= 75 ? 'Low saturated fat' : p >= 40 ? 'Some saturated fat' : 'High saturated fat';
  }
}

/** Splits known factors into what pulls the score down and up, biggest impact first. */
export function splitFactors(factors: Factor[]) {
  const known = factors.filter((f) => f.points !== null);
  const impact = (f: Factor) => f.weight * Math.abs(f.points! - 50);
  return {
    negatives: known.filter((f) => f.points! < 50).sort((a, b) => impact(b) - impact(a)),
    positives: known.filter((f) => f.points! >= 50).sort((a, b) => impact(b) - impact(a)),
    missing: factors.filter((f) => f.points === null),
  };
}

const BANDS: { key: RatingKey; label: string }[] = [
  { key: 'poor', label: 'Poor' }, { key: 'mediocre', label: 'Mediocre' },
  { key: 'good', label: 'Good' }, { key: 'excellent', label: 'Excellent' },
];

/** Four-band colour scale with a marker at the product's score. */
export function ScoreScale({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: spacing.lg }}>
    <View style={{ height: 10, marginLeft: `${pct}%`, width: 0 }}>
      <View style={{ position: 'absolute', left: -6, top: 0, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
        borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.text }} />
    </View>
    <View style={{ flexDirection: 'row', height: 8, borderRadius: radius.pill, overflow: 'hidden', gap: 2 }}>
      {BANDS.map((band) => <View key={band.key} style={{ flex: 1, backgroundColor: colors.score[band.key] }} />)}
    </View>
    <View style={{ flexDirection: 'row', marginTop: spacing.xs }}>
      {BANDS.map((band) => <Text key={band.key} style={[typography.small, { flex: 1, textAlign: 'center', fontSize: 11 }]}>{band.label}</Text>)}
    </View>
  </View>;
}

function FactorRow({ factor, totalWeight, last }: { factor: Factor; totalWeight: number; last: boolean }) {
  const [open, setOpen] = useState(false);
  const color = pointsColor(factor.points);
  const share = Math.round((factor.weight / totalWeight) * 100);
  return <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.surfaceMuted }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open}
      accessibilityLabel={`${factor.label}: ${factorVerdict(factor)}, ${factor.value}`} onPress={() => setOpen(!open)}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: spacing.sm, gap: spacing.md }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '22' }}>
        <Ionicons name={FACTOR_ICON[factor.id]} size={18} color={colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={typography.subheading}>{factor.label}</Text>
        <Text style={typography.small}>{factorVerdict(factor)}</Text>
      </View>
      <Text style={[typography.small, { fontWeight: '600', color: colors.text, maxWidth: 120, textAlign: 'right' }]} numberOfLines={2}>{factor.value}</Text>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
    </Pressable>
    {open ? <View style={{ paddingLeft: 36 + spacing.md, paddingBottom: spacing.md }}>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginBottom: spacing.sm }}>
        <View style={{ height: 6, width: `${factor.points ?? 0}%`, backgroundColor: color }} />
      </View>
      <Text style={typography.body}>{factor.explanation}</Text>
      <Text style={[typography.small, { marginVertical: spacing.xs }]}>{factor.points ?? '–'}/100 · {share}% of the score</Text>
      <SourceLink name={factor.source.name} url={factor.source.url} />
    </View> : null}
  </View>;
}

export function FactorSection({ title, tone, factors, totalWeight }: {
  title: string; tone: 'negative' | 'positive'; factors: Factor[]; totalWeight: number;
}) {
  if (!factors.length) return null;
  return <View style={{ marginTop: spacing.lg }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
      <Ionicons name={tone === 'negative' ? 'alert-circle' : 'checkmark-circle'} size={20} color={tone === 'negative' ? colors.score.poor : colors.score.excellent} />
      <Text accessibilityRole="header" style={typography.heading}>{title}</Text>
    </View>
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg }}>
      {factors.map((f, i) => <FactorRow key={f.id} factor={f} totalWeight={totalWeight} last={i === factors.length - 1} />)}
    </View>
  </View>;
}

const NUTRITION_ROWS: { key: keyof Nutrients; label: string; unit: string; factor?: Factor['id'] }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'sugars', label: 'Sugar', unit: 'g', factor: 'sugar' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', factor: 'saturatedFat' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg', factor: 'sodium' },
];

export function NutritionFacts({ per100g, servingG, servingLabel, factors }: {
  per100g: Nutrients; servingG: number | null; servingLabel: string | null; factors: Factor[];
}) {
  const [perServing, setPerServing] = useState(false);
  const scale = perServing && servingG ? servingG / 100 : 1;
  const fmt = (value: number, unit: string) => {
    const scaled = value * scale;
    return `${unit === 'g' && scaled < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled)} ${unit}`;
  };
  const toggle = (on: boolean, label: string) => <Pressable accessibilityRole="button" accessibilityState={{ selected: perServing === on }} onPress={() => setPerServing(on)}
    style={{ flex: 1, minHeight: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: perServing === on ? colors.surface : 'transparent' }}>
    <Text style={[typography.label, { color: colors.text }]} numberOfLines={1}>{label}</Text>
  </Pressable>;
  return <View style={{ marginTop: spacing.lg }}>
    <Text accessibilityRole="header" style={[typography.heading, { marginBottom: spacing.sm }]}>Nutrition facts</Text>
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg }}>
      {servingG ? <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, padding: 3, marginBottom: spacing.md }}>
        {toggle(false, 'Per 100 g')}
        {toggle(true, `Per serving · ${servingLabel ?? `${servingG} g`}`)}
      </View> : <Text style={[typography.small, { marginBottom: spacing.sm }]}>Per 100 g</Text>}
      {NUTRITION_ROWS.map((row, i) => {
        const value = per100g[row.key] as number | null | undefined;
        const factor = row.factor ? factors.find((f) => f.id === row.factor) : undefined;
        return <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36, borderTopWidth: i ? 1 : 0, borderTopColor: colors.surfaceMuted }}>
          <Text style={[typography.body, { flex: 1 }, i === 0 && { fontWeight: '700' }]}>{row.label}</Text>
          {factor && factor.points !== null ? <View style={{ width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm, backgroundColor: pointsColor(factor.points) }} /> : null}
          <Text style={[typography.body, { fontWeight: i === 0 ? '700' : '600' }]}>{value == null ? '—' : fmt(value, row.unit)}</Text>
        </View>;
      })}
    </View>
  </View>;
}

export function AlternativesRail({ items, onOpen }: { items: Alternative[]; onOpen: (barcode: string) => void }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg, flexGrow: 0 }}
    contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
    {items.map(({ product, result }) => <Pressable key={product.barcode} accessibilityRole="button"
      accessibilityLabel={`${product.name}, score ${result.score ?? 'unknown'}`} onPress={() => onOpen(product.barcode)}
      style={{ width: 148, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md }}>
      <View style={{ height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {product.imageUrl ? <Image source={{ uri: product.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          : <Ionicons name="image-outline" size={28} color={colors.textMuted} />}
        <View style={{ position: 'absolute', top: spacing.xs, right: spacing.xs }}><ScoreBadge score={result.score} rating={result.rating} size={36} /></View>
      </View>
      <Text style={[typography.subheading, { marginTop: spacing.sm, fontSize: 14 }]} numberOfLines={2}>{product.name}</Text>
      {product.brand ? <Text style={typography.small} numberOfLines={1}>{product.brand}</Text> : null}
    </Pressable>)}
  </ScrollView>;
}
