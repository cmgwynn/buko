import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Attribution, SourceLink } from '../../src/components/Attribution';
import { ScoreBadge, scoreColor } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Heading, Loading, Notice, Screen } from '../../src/components/ui';
import { findAlternatives, type Alternative } from '../../src/lib/api/alternatives';
import { getProductByBarcode } from '../../src/lib/api/openFoodFacts';
import { dietConflicts } from '../../src/lib/diet';
import { scoreProduct, type Factor } from '../../src/lib/scoring';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Product } from '../../src/types';

function FactorCard({ factor, totalWeight }: { factor: Factor; totalWeight: number }) {
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

export default function ProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alts, setAlts] = useState<Alternative[] | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProduct(null);
    setAlts(null);
    setAdded(false);
    getProductByBarcode(barcode)
      .then((p) => { if (!cancelled) setProduct(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barcode]);

  const result = useMemo(() => (product ? scoreProduct(product) : null), [product]);

  useEffect(() => {
    if (!product || !result) return;
    let cancelled = false;
    findAlternatives(product, result)
      .then((a) => { if (!cancelled) setAlts(a); })
      .catch(() => { if (!cancelled) setAlts([]); });
    return () => { cancelled = true; };
  }, [product, result]);

  async function addToGrocery() {
    if (!product || !session) return;
    const { error: e } = await supabase.from('grocery_items').insert({
      user_id: session.user.id,
      name: product.brand ? `${product.name} (${product.brand})` : product.name,
      barcode: product.barcode, source: 'off', source_id: product.sourceId,
    });
    if (e) setError(e.message);
    else setAdded(true);
  }

  if (loading) return <Loading />;

  if (error || !product || !result) {
    return (
      <Screen edges={[]}>
        <Notice tone={error ? 'danger' : 'warning'}>
          {error ?? `We couldn't find barcode ${barcode} in Open Food Facts. It may not have been added yet.`}
        </Notice>
        <Button title="Go back" variant="secondary" onPress={() => router.back()} />
        <Attribution />
      </Screen>
    );
  }

  const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
  const conflicts = profile ? dietConflicts(product, profile.diet_prefs) : [];
  const color = scoreColor(result.rating);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: product.name.length > 24 ? `${product.name.slice(0, 22)}…` : product.name }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={{ width: 72, height: 72, borderRadius: radius.md, marginRight: spacing.lg, backgroundColor: colors.surfaceMuted }} resizeMode="contain" />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={typography.heading} numberOfLines={3}>{product.name}</Text>
            {product.brand ? <Text style={typography.small}>{product.brand}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg }}>
          <ScoreBadge score={result.score} rating={result.rating} />
          <View style={{ marginLeft: spacing.lg, flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color }}>{result.ratingLabel}</Text>
            {result.score === null ? (
              <Text style={typography.small}>This product doesn&apos;t list enough information to score it fairly.</Text>
            ) : result.confidence < 1 ? (
              <Text style={typography.small}>Based on the {Math.round(result.confidence * 100)}% of factors with data available.</Text>
            ) : null}
          </View>
        </View>
      </Card>

      {conflicts.length ? (
        <Notice tone="danger">
          Conflicts with your preferences: {conflicts.join(' ')}
        </Notice>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Log food" icon="add-circle-outline" onPress={() => router.push({ pathname: '/log/add', params: { food: JSON.stringify(product) } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={added ? 'Added ✓' : 'Add to list'} icon="cart-outline" variant="secondary" disabled={added} onPress={addToGrocery} />
        </View>
      </View>

      <View style={{ marginVertical: spacing.md }}><Heading>Why this score</Heading></View>
      {result.factors.map((f) => <FactorCard key={f.id} factor={f} totalWeight={totalWeight} />)}
      <Body muted>
        Buko&apos;s score is an estimate that combines the factors above. It is not medical advice, and each factor links to its source.
      </Body>

      {result.score !== null && result.score < 50 ? (
        <View style={{ marginTop: spacing.xl }}>
          <Heading>Better alternatives</Heading>
          <View style={{ height: spacing.md }} />
          {alts === null ? <Body muted>Looking for higher-scoring products in the same category…</Body> : null}
          {alts?.length === 0 ? <Body muted>We couldn&apos;t find clearly better products in this category.</Body> : null}
          {alts?.map(({ product: a, result: r }) => (
            <Pressable key={a.barcode} onPress={() => router.push({ pathname: '/product/[barcode]', params: { barcode: a.barcode } })}>
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ScoreBadge score={r.score} rating={r.rating} size={52} />
                <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                  <Text style={typography.subheading} numberOfLines={2}>{a.name}</Text>
                  {a.brand ? <Text style={typography.small}>{a.brand}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Attribution />
    </Screen>
  );
}
