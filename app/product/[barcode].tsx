import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Attribution } from '../../src/components/Attribution';
import { AlternativesRail, FactorSection, NutritionFacts, ScoreScale, splitFactors } from '../../src/components/product/ProductInsights';
import { ScoreBadge, scoreColor } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Loading, Notice, Screen } from '../../src/components/ui';
import { incompleteNutritionMessage } from '../../src/lib/foodLogging';
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
  const hasDiet = !!profile?.diet_prefs.length;
  const color = scoreColor(result.rating);
  const { negatives, positives, missing } = splitFactors(result.factors);
  const incomplete = incompleteNutritionMessage(product.per100g);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: product.name.length > 24 ? `${product.name.slice(0, 22)}…` : product.name }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <View style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {product.imageUrl
              ? <Image accessibilityIgnoresInvertColors source={{ uri: product.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              : <Ionicons name="image-outline" size={32} color={colors.textMuted} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={typography.heading} numberOfLines={3}>{product.name}</Text>
            {product.brand ? <Text style={[typography.small, { marginTop: 2 }]}>{product.brand}</Text> : null}
            {product.servingLabel ? <Text style={typography.small}>Serving {product.servingLabel}</Text> : null}
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: colors.surfaceMuted, marginVertical: spacing.lg }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <ScoreBadge score={result.score} rating={result.rating} size={84} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color }}>{result.ratingLabel}</Text>
            <Text style={typography.small}>
              {result.score === null ? 'Not enough label data to score fairly.' : `${result.score} out of 100`}
              {result.score !== null && result.confidence < 1 ? ` · ${Math.round(result.confidence * 100)}% of data` : ''}
            </Text>
          </View>
        </View>
        {result.score !== null ? <ScoreScale score={result.score} /> : null}
        {conflicts.length || hasDiet ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
          {conflicts.length ? conflicts.map((c) => <Pill key={c} tone="danger" icon="alert-circle" text={c.replace(/\.$/, '')} />)
            : <Pill tone="ok" icon="checkmark-circle" text="Fits your diet" />}
        </View> : null}
      </Card>

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
      {incomplete ? <Notice>{incomplete}</Notice> : null}
      {addError ? <Notice tone="danger">{addError}</Notice> : null}

      <FactorSection title="Negatives" tone="negative" factors={negatives} totalWeight={totalWeight} />
      <FactorSection title="Positives" tone="positive" factors={positives} totalWeight={totalWeight} />
      {missing.length ? <Text style={[typography.small, { marginTop: spacing.sm }]}>
        Not scored (no data): {missing.map((f) => f.label).join(', ')}. Their weight is shared by the factors above.
      </Text> : null}

      {result.score !== null && result.score < 50 ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text accessibilityRole="header" style={[typography.heading, { marginBottom: spacing.sm }]}>Better alternatives</Text>
          {alts === null ? <Body muted>Finding higher-scoring products in this category…</Body> : null}
          {alts?.length === 0 && altsFailed ? <>
            <Body muted>The food database is busy, so alternatives couldn&apos;t load.</Body>
            <Button title="Try again" variant="secondary" onPress={() => setAltsAttempt((n) => n + 1)} />
          </> : null}
          {alts?.length === 0 && !altsFailed ? <Body muted>No clearly better products found in this category.</Body> : null}
          {alts?.length ? <AlternativesRail items={alts} onOpen={(code) => router.push({ pathname: '/product/[barcode]', params: { barcode: code } })} /> : null}
        </View>
      ) : null}

      <NutritionFacts per100g={product.per100g} servingG={product.servingG} servingLabel={product.servingLabel} factors={result.factors} />

      <Text style={[typography.small, { marginTop: spacing.lg }]}>
        Tap any factor to see how it&apos;s scored and its source. Buko&apos;s score is an estimate, not medical advice.
      </Text>
      <Attribution />
    </Screen>
  );
}

function Pill({ tone, icon, text }: { tone: 'danger' | 'ok'; icon: 'alert-circle' | 'checkmark-circle'; text: string }) {
  const fg = tone === 'danger' ? colors.danger : colors.score.excellent;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.pill, backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.primarySoft }}>
    <Ionicons name={icon} size={16} color={fg} />
    <Text style={[typography.label, { color: fg }]}>{text}</Text>
  </View>;
}
