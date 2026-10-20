import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { RecipeImage } from '../../src/components/RecipeImage';
import { ScoreBadge } from '../../src/components/ScoreBadge';
import { Body, Button, Card, Label, Notice, Screen, TextField } from '../../src/components/ui';
import { blankIngredient, updateDraft, useDraft } from '../../src/lib/recipes/draft';
import { pickPhoto, saveRecipe } from '../../src/lib/recipes/db';
import { matchAll, reparse } from '../../src/lib/recipes/matching';
import { computeRecipeNutrition, scoreRecipe } from '../../src/lib/recipes/nutrition';
import { detectTimerSeconds } from '../../src/lib/recipes/timers';
import { useAuth } from '../../src/providers/AuthProvider';
import { colors, radius, spacing, typography } from '../../src/theme';

const intOrNull = (t: string) => {
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function EditRecipe() {
  const router = useRouter();
  const { session } = useAuth();
  const d = useDraft();
  const [busy, setBusy] = useState<'match' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nutrition = computeRecipeNutrition(d.ingredients, d.servings);
  const score = nutrition.counted > 0 ? scoreRecipe(d.title || 'Recipe', nutrition) : null;

  async function match() {
    setBusy('match');
    const next = await matchAll(d.ingredients);
    updateDraft({ ingredients: next });
    setBusy(null);
  }

  async function save() {
    if (!session) return;
    if (!d.title.trim()) return setError('Give the recipe a title.');
    if (!d.ingredients.some((i) => i.raw_text.trim())) return setError('Add at least one ingredient.');
    setBusy('save');
    setError(null);
    try {
      // Anything not matched yet gets one automatic attempt, so nutrition is calculated without extra taps.
      const ingredients = await matchAll(d.ingredients);
      updateDraft({ ingredients });
      const id = await saveRecipe(session.user.id, { ...d, ingredients });
      router.replace({ pathname: '/recipe/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the recipe.');
      setBusy(null);
    }
  }

  async function choosePhoto() {
    try {
      const uri = await pickPhoto();
      if (uri) updateDraft({ photoUri: uri });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open photos.');
    }
  }

  const setIngredient = (i: number, text: string) =>
    updateDraft((cur) => ({ ingredients: cur.ingredients.map((x, idx) => (idx === i ? reparse(x, text) : x)) }));
  const removeIngredient = (i: number) => updateDraft((cur) => ({ ingredients: cur.ingredients.filter((_, idx) => idx !== i) }));
  const setStep = (i: number, text: string) =>
    updateDraft((cur) => ({ steps: cur.steps.map((x, idx) => (idx === i ? { ...x, text, timer_seconds: detectTimerSeconds(text) } : x)) }));
  const removeStep = (i: number) => updateDraft((cur) => ({ steps: cur.steps.filter((_, idx) => idx !== i) }));

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: d.id ? 'Edit recipe' : 'New recipe' }} />
      <Pressable onPress={choosePhoto} accessibilityLabel="Choose a photo">
        <RecipeImage path={d.photoPath} localUri={d.photoUri} style={{ height: 160, marginBottom: spacing.sm }} />
        <Text style={[typography.small, { textAlign: 'center', marginBottom: spacing.lg }]}>
          {d.photoUri || d.photoPath ? 'Tap to change photo' : 'Add your own photo (optional)'}
        </Text>
      </Pressable>

      <TextField label="Title" value={d.title} onChangeText={(t) => updateDraft({ title: t })} placeholder="e.g. Lemon chicken bowls" />

      <Label>Servings</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
        <Pressable onPress={() => updateDraft({ servings: Math.max(1, d.servings - 1) })} style={stepBtn} accessibilityLabel="Fewer servings">
          <Ionicons name="remove" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[typography.heading, { marginHorizontal: spacing.xl }]}>{d.servings}</Text>
        <Pressable onPress={() => updateDraft({ servings: Math.min(100, d.servings + 1) })} style={stepBtn} accessibilityLabel="More servings">
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <TextField label="Prep (min)" keyboardType="number-pad" value={d.prepMinutes?.toString() ?? ''} onChangeText={(t) => updateDraft({ prepMinutes: intOrNull(t) })} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Cook (min)" keyboardType="number-pad" value={d.cookMinutes?.toString() ?? ''} onChangeText={(t) => updateDraft({ cookMinutes: intOrNull(t) })} />
        </View>
      </View>

      {d.sourceUrl ? (
        <Pressable onPress={() => Linking.openURL(d.sourceUrl!)} style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.small, { color: colors.primary, textDecorationLine: 'underline' }]}>Source: {d.sourceName ?? d.sourceUrl}</Text>
        </Pressable>
      ) : null}

      <Label>Ingredients</Label>
      <Body muted>One per line, like “2 cups flour” or “1 onion, chopped”.</Body>
      <View style={{ height: spacing.sm }} />
      {d.ingredients.map((ing, i) => (
        <Card key={i} style={{ padding: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={ing.raw_text}
              onChangeText={(t) => setIngredient(i, t)}
              placeholder="e.g. 2 cups flour"
              placeholderTextColor={colors.textMuted}
              style={[typography.body, { flex: 1, paddingVertical: 6 }]}
            />
            <Pressable onPress={() => removeIngredient(i)} hitSlop={10} accessibilityLabel="Remove ingredient">
              <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/recipe/match', params: { index: String(i) } })} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Ionicons
              name={ing.match_status === 'unmatched' || !ing.grams ? 'alert-circle-outline' : 'checkmark-circle'}
              size={16}
              color={ing.match_status === 'unmatched' || !ing.grams ? colors.warning : colors.primary}
            />
            <Text style={[typography.small, { marginLeft: 6 }]}>
              {ing.match_status === 'unmatched'
                ? 'No nutrition match yet · tap to choose'
                : ing.grams
                  ? `${Math.round(ing.grams)} g${ing.nutrition ? ` · ${Math.round(((ing.nutrition.per100g.calories ?? 0) * ing.grams) / 100)} kcal` : ''} · tap to review`
                  : 'Needs a weight · tap to set'}
            </Text>
          </Pressable>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Add ingredient" icon="add" variant="secondary" onPress={() => updateDraft((cur) => ({ ingredients: [...cur.ingredients, blankIngredient(cur.ingredients.length)] }))} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Match foods" icon="sparkles-outline" variant="secondary" onPress={match} loading={busy === 'match'} disabled={!d.ingredients.length} />
        </View>
      </View>

      {d.servingsGuessed ? <Notice>This page didn’t say how many servings it makes, so we assumed {d.servings}. Set the real number above; per-serving calories depend on it.</Notice> : null}
      {d.siteCalories && nutrition.counted > 0 ? (
        <Notice tone={Math.abs(nutrition.perServing.calories - d.siteCalories) / d.siteCalories > 0.25 ? 'warning' : 'info'}>
          The source site lists {d.siteCalories} kcal per serving; we calculate {Math.round(nutrition.perServing.calories)}. Sites often estimate differently. If ours looks off, check the servings count and each ingredient’s weight and matched food (each shows its kcal above).
        </Notice>
      ) : null}
      {nutrition.counted > 0 ? (
        <Card style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center' }}>
          {score ? <ScoreBadge score={score.score} rating={score.rating} size={56} /> : null}
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={typography.subheading}>{Math.round(nutrition.perServing.calories)} kcal per serving</Text>
            <Text style={typography.small}>
              P {Math.round(nutrition.perServing.protein_g)} · C {Math.round(nutrition.perServing.carbs_g)} · F {Math.round(nutrition.perServing.fat_g)} g
              {nutrition.excluded ? ` · ${nutrition.excluded} ingredient${nutrition.excluded === 1 ? '' : 's'} not counted yet` : ''}
            </Text>
          </View>
        </Card>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Label>Steps</Label>
      {d.steps.map((s, i) => (
        <Card key={i} style={{ padding: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text style={[typography.subheading, { width: 26, paddingTop: 6 }]}>{i + 1}</Text>
            <TextInput
              value={s.text}
              onChangeText={(t) => setStep(i, t)}
              multiline
              placeholder="Describe this step"
              placeholderTextColor={colors.textMuted}
              style={[typography.body, { flex: 1, paddingVertical: 6, minHeight: 40 }]}
            />
            <Pressable onPress={() => removeStep(i)} hitSlop={10} accessibilityLabel="Remove step" style={{ paddingTop: 6 }}>
              <Ionicons name="close-circle-outline" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          {s.timer_seconds ? <Text style={[typography.small, { marginLeft: 26 }]}>Timer: {Math.round(s.timer_seconds / 60)} min (detected)</Text> : null}
        </Card>
      ))}
      <Button title="Add step" icon="add" variant="secondary" onPress={() => updateDraft((cur) => ({ steps: [...cur.steps, { position: cur.steps.length, text: '', timer_seconds: null }] }))} />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ height: spacing.lg }} />
      <Button title={d.id ? 'Save changes' : 'Save recipe'} onPress={save} loading={busy === 'save'} />
    </Screen>
  );
}

const stepBtn = { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' } as const;
