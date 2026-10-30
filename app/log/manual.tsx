import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Body, Button, Notice, Screen, TextField } from '../../src/components/ui';
import { manualFormFromFood, parseManualFood, type ManualFoodErrors, type ManualFoodForm } from '../../src/lib/foodLogging';
import { spacing, typography } from '../../src/theme';
import type { Food } from '../../src/types';
import { MICRONUTRIENTS } from '../../src/lib/nutrition/micronutrients';

/** Enter label nutrition by hand (unknown barcode or incomplete source data), then choose an amount to log. */
export default function ManualFood() {
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string; date?: string; barcode?: string; food?: string }>();
  const initial = useMemo(() => {
    let food: Food | null = null;
    try { food = params.food ? JSON.parse(params.food) as Food : null; } catch { food = null; }
    return manualFormFromFood(food, params.barcode || undefined);
  }, [params.food, params.barcode]);
  const [form, setForm] = useState<ManualFoodForm>(initial);
  const [errors, setErrors] = useState<ManualFoodErrors>({});

  const set = (key: keyof ManualFoodForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  function next() {
    const result = parseManualFood(form);
    if ('errors' in result) return setErrors(result.errors);
    router.replace({ pathname: '/log/add', params: { food: JSON.stringify(result.food), meal: params.meal, date: params.date } });
  }

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <Screen variant="form" edges={[]}>
      <Body muted>Copy the values from the nutrition label. All four are required; enter 0 only when the label says 0.</Body>
      {form.barcode ? <Text style={[typography.small, { marginTop: spacing.sm }]}>Barcode {form.barcode} · saved only in this diary entry</Text> : null}
      <View style={{ height: spacing.lg }} />
      <TextField label="Food name" value={form.name} onChangeText={set('name')} error={errors.name} autoCapitalize="sentences" />
      <TextField label="Brand (optional)" value={form.brand} onChangeText={set('brand')} />
      <TextField label="Values are for this many grams" value={form.basisGrams} onChangeText={set('basisGrams')} keyboardType="decimal-pad" error={errors.basisGrams} />
      <TextField label="Serving name (optional, e.g. 1 bar)" value={form.servingLabel} onChangeText={set('servingLabel')} />
      <TextField label="Calories (kcal)" value={form.calories} onChangeText={set('calories')} keyboardType="decimal-pad" error={errors.calories} />
      <TextField label="Protein (g)" value={form.protein} onChangeText={set('protein')} keyboardType="decimal-pad" error={errors.protein} />
      <TextField label="Carbohydrate (g)" value={form.carbs} onChangeText={set('carbs')} keyboardType="decimal-pad" error={errors.carbs} />
      <TextField label="Fat (g)" value={form.fat} onChangeText={set('fat')} keyboardType="decimal-pad" error={errors.fat} />
      <Body muted>Optional values from the label. Unknown nutrients stay unreported.</Body>
      {MICRONUTRIENTS.map((item) => (
        <TextField
          key={item.key}
          label={`${item.label} (${item.unit} per ${form.basisGrams || 100} g)`}
          value={form[item.key] ?? ''}
          onChangeText={set(item.key)}
          keyboardType="decimal-pad"
          error={errors[item.key]}
        />
      ))}
      {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}
      {hasErrors && !errors.form ? <Notice tone="danger">Fix the highlighted fields to continue.</Notice> : null}
      <Button title="Continue to amount" onPress={next} />
    </Screen>
  );
}
