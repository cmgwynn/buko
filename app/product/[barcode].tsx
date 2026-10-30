import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { FactorCard } from '../../src/components/FactorCard';
import { ScoreBadge, scoreColor } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Heading, Loading, Notice, Screen } from '../../src/components/ui';
import { incompleteNutritionMessage, mainScoreReasons } from '../../src/lib/foodLogging';
import { findAlternatives, type Alternative } from '../../src/lib/api/alternatives';
import { getProductByBarcode } from '../../src/lib/api/openFoodFacts';
import { dietConflicts } from '../../src/lib/diet';
import { scoreProduct } from '../../src/lib/scoring';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import { useProfile } from '../../src/providers/ProfileProvider';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Product } from '../../src/types';

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
  const [addError, setAddError] = useState<string | null>(null);
  const [showFactors, setShowFactors] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [altsFailed, setAltsFailed] = useState(false);
  const [altsAttempt, setAltsAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProduct(null);
    setAlts(null);
    setAdded(false);
    setAddError(null);
    setShowFactors(false);
    getProductByBarcode(barcode)
      .then((p) => { if (!cancelled) setProduct(p); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barcode, attempt]);

  const result = useMemo(() => (product ? scoreProduct(product) : null), [product]);

  useEffect(() => {
    if (!product || !result) return;
    let cancelled = false;
    setAlts(null); setAltsFailed(false);
    findAlternatives(product, result)
      .then((a) => { if (!cancelled) setAlts(a); })
      .catch(() => { if (!cancelled) { setAlts([]); setAltsFailed(true); } });
    return () => { cancelled = true; };
  }, [product, result, altsAttempt]);

  async function addToGrocery() {
    if (!product || !session) return;
    const { error: e } = await supabase.from('grocery_items').insert({
      user_id: session.user.id,
      name: product.brand ? `${product.name} (${product.brand})` : product.name,
      barcode: product.barcode, source: 'off', source_id: product.sourceId,
    });
    if (e) setAddError(`Could not add to your grocery list: ${e.message}`);
    else setAdded(true);
  }

  if (loading) return <Loading />;

  if (error || !product || !result) {
    return (
      <Screen edges={[]}>
        <Notice tone={error ? 'danger' : 'warning'}>
          {error ?? `We couldn't find barcode ${barcode} in Open Food Facts. It may not have been added yet.`}
        </Notice>
        <Button title="Try again" icon="refresh" onPress={() => setAttempt((n) => n + 1)} />
        <Button title="Search by name" icon="search" variant="secondary" onPress={() => router.push('/log/search')} />
        <Button title="Enter nutrition manually" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/log/manual', params: { barcode } })} />
        <Attribution />
      </Screen>
    );
  }

  const totalWeight = result.factors.reduce((s, f) => s + f.weight, 0);
  const conflicts = profile ? dietConflicts(product, profile.diet_prefs) : [];
  const color = scoreColor(result.rating);
  const reasons = mainScoreReasons(result.factors, 3);
  const incomplete = incompleteNutritionMessage(product.per100g);

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

      {reasons.length ? (
        <Card>
          <Text style={[typography.label, { marginBottom: spacing.sm }]}>Main reasons</Text>
          {reasons.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xs }}>
              <Ionicons name={f.points! >= 50 ? 'checkmark-circle' : 'alert-circle'} size={18} color={f.points! >= 50 ? colors.score.excellent : colors.score.poor} style={{ marginRight: spacing.sm, marginTop: 2 }} />
              <Text style={[typography.body, { flex: 1 }]}><Text style={{ fontWeight: '600' }}>{f.label}:</Text> {f.value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {conflicts.length ? (
        <Notice tone="danger">
          Conflicts with your preferences: {conflicts.join(' ')}
        </Notice>
      ) : null}

      {incomplete ? <Notice>{incomplete}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          {incomplete ? (
            <Button title="Enter nutrition" icon="create-outline" onPress={() => router.push({ pathname: '/log/manual', params: { barcode: product.barcode, food: JSON.stringify(product) } })} />
          ) : (
            <Button title="Log food" icon="add-circle-outline" onPress={() => router.push({ pathname: '/log/add', params: { food: JSON.stringify(product) } })} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Button title={added ? 'Added ✓' : 'Add to list'} icon="cart-outline" variant="secondary" disabled={added} onPress={addToGrocery} />
        </View>
      </View>
      {addError ? <Notice tone="danger">{addError}</Notice> : null}

      {result.score !== null && result.score < 50 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Heading>Better alternatives</Heading>
          <View style={{ height: spacing.md }} />
          {alts === null ? <Body muted>Looking for higher-scoring products in the same category…</Body> : null}
          {alts?.length === 0 && altsFailed ? <>
            <Body muted>The food database is busy, so alternatives couldn&apos;t load.</Body>
            <Button title="Try again" variant="secondary" onPress={() => setAltsAttempt((n) => n + 1)} />
          </> : null}
          {alts?.length === 0 && !altsFailed ? <Body muted>We couldn&apos;t find clearly better products in this category.</Body> : null}
          {alts?.map(({ product: a, result: r }) => (
            <Pressable key={a.barcode} accessibilityRole="button" accessibilityLabel={`${a.name}, score ${r.score ?? 'unknown'}`} onPress={() => router.push({ pathname: '/product/[barcode]', params: { barcode: a.barcode } })}>
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

      <Pressable
        onPress={() => setShowFactors(!showFactors)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showFactors }}
        aria-expanded={showFactors}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginTop: spacing.md }}
      >
        <Heading>Why this score</Heading>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[typography.small, { color: colors.primary, marginRight: spacing.xs }]}>{showFactors ? 'Hide' : `All ${result.factors.length} factors`}</Text>
          <Ionicons name={showFactors ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
        </View>
      </Pressable>
      {showFactors ? result.factors.map((f) => <FactorCard key={f.id} factor={f} totalWeight={totalWeight} />) : null}
      <Body muted>
        Buko&apos;s score is an estimate that combines these factors. It is not medical advice, and each factor links to its source.
      </Body>

      <Attribution />
    </Screen>
  );
}
