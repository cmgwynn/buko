import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { WorkoutSet } from '../../lib/fitness/types';
import { fromDisplayWeight, toDisplayWeight, weightUnit } from '../../lib/fitness/format';
import { colors, radius, spacing, typography } from '../../theme';
import { Button } from '../ui';

function WorkoutNumber({ label, value, onChange, onValidityChange, integer, max, disabled }: {
  label: string; value: number | null; onChange(value: number | null): void; onValidityChange(invalid: boolean): void; integer?: boolean; max: number; disabled?: boolean;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused && !invalid) setText(value === null ? '' : String(value)); }, [value, focused, invalid]);
  return <View style={{ flex: 1, minWidth: 70 }}>
    <Text style={typography.small}>{label}</Text>
    <TextInput accessibilityLabel={label} value={text} editable={!disabled} keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      selectTextOnFocus style={{ minHeight: 60, borderWidth: 2, borderColor: invalid ? colors.danger : colors.border,
        borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 24, fontWeight: '700', textAlign: 'center' }}
      onChangeText={(input) => {
        setText(input);
        const clean = input.trim().replace(',', '.');
        const value = clean === '' ? null : Number(clean);
        const bad = value !== null && (!/^\d+(\.\d+)?$/.test(clean) || !Number.isFinite(value) || value < 0 || value > max || (integer === true && !Number.isInteger(value)));
        setInvalid(bad);
        onValidityChange(bad);
        onChange(bad ? null : value);
      }} />
    {invalid ? <Text accessibilityRole="alert" style={[typography.small, { color: colors.danger }]}>Enter {integer ? 'a whole number' : 'a number'} from 0 to {max}.</Text> : null}
  </View>;
}

export function WorkoutSetRow({ set, index, units, cardio, completed, onPatch, onDone, onUndo, onRemove }: {
  set: WorkoutSet & { rpe?: number | null }; index: number; units: 'metric' | 'imperial'; cardio: boolean; completed: boolean;
  onPatch(patch: Partial<WorkoutSet> & { rpe?: number | null }): void;
  onDone(): void; onUndo(): void; onRemove(): void;
}) {
  const [effort, setEffort] = useState(set.rpe != null);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const invalid = Object.values(invalidFields).some(Boolean);
  function validity(field: string, value: boolean) { setInvalidFields((fields) => ({ ...fields, [field]: value })); }
  return <View style={{ padding: spacing.md, borderWidth: 2, borderColor: completed ? colors.primary : colors.border,
    borderRadius: radius.md, marginBottom: spacing.md, backgroundColor: completed ? colors.primarySoft : colors.surface }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={typography.subheading}>Set {index + 1}{set.is_warmup ? ' · warm-up' : ''}{completed ? ' · completed' : ''}</Text>
      {!completed ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove set ${index + 1}`} onPress={onRemove} style={{ minWidth: 56, minHeight: 56, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[typography.body, { color: colors.danger }]}>Remove</Text>
      </Pressable> : null}
    </View>
    <View style={{ flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' }}>
      {cardio ? <>
        <WorkoutNumber label={`Set ${index + 1} minutes`} value={set.duration_s === null ? null : Math.round(set.duration_s / 60 * 100) / 100}
          max={1440} disabled={completed} onValidityChange={(value) => validity('duration', value)} onChange={(value) => onPatch({ duration_s: value === null ? null : Math.round(value * 60) })} />
        <WorkoutNumber label={`Set ${index + 1} meters (optional)`} value={set.distance_m} max={1000000} disabled={completed} onValidityChange={(value) => validity('distance', value)} onChange={(distance_m) => onPatch({ distance_m })} />
      </> : <>
        <WorkoutNumber label={`Set ${index + 1} ${weightUnit(units)} (0 = bodyweight)`} value={set.weight_kg === null ? null : toDisplayWeight(set.weight_kg, units)}
          max={units === 'imperial' ? 3306 : 1500} disabled={completed} onValidityChange={(value) => validity('weight', value)} onChange={(value) => onPatch({ weight_kg: value === null ? null : fromDisplayWeight(value, units) })} />
        <WorkoutNumber label={`Set ${index + 1} reps`} value={set.reps} integer max={1000} disabled={completed} onValidityChange={(value) => validity('reps', value)} onChange={(reps) => onPatch({ reps })} />
      </>}
    </View>
    {!completed ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.sm }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.is_warmup }} aria-checked={set.is_warmup} onPress={() => onPatch({ is_warmup: !set.is_warmup })}
        style={{ minHeight: 56, justifyContent: 'center' }}><Text style={typography.body}>{set.is_warmup ? '[x]' : '[ ]'} Warm-up</Text></Pressable>
      <Button title={effort ? 'Hide effort rating' : 'Add effort rating'} variant="ghost" onPress={() => setEffort(!effort)} />
    </View> : null}
    {effort ? <View style={{ marginVertical: spacing.sm }}>
      <Text style={typography.small}>RPE (optional): 1 = very easy, 10 = maximum effort</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {Array.from({ length: 10 }, (_, n) => n + 1).map((value) => <Pressable key={value} disabled={completed} accessibilityRole="radio"
          accessibilityLabel={`Set ${index + 1} RPE ${value}`} accessibilityState={{ selected: set.rpe === value }} aria-selected={set.rpe === value}
          onPress={() => onPatch({ rpe: set.rpe === value ? null : value })}
          style={{ minWidth: 56, minHeight: 56, borderRadius: radius.sm, backgroundColor: set.rpe === value ? colors.primary : colors.surfaceMuted, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={[typography.subheading, { color: set.rpe === value ? colors.onPrimary : colors.text }]}>{value}</Text>
        </Pressable>)}
      </View>
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={completed ? `Undo set ${index + 1}` : `Done set ${index + 1}`} disabled={!completed && invalid}
      accessibilityState={{ disabled: !completed && invalid }} onPress={completed ? onUndo : onDone}
      style={{ minHeight: 64, borderRadius: radius.md, backgroundColor: completed ? colors.surface : colors.primary, opacity: !completed && invalid ? 0.5 : 1, justifyContent: 'center', alignItems: 'center', marginTop: spacing.md }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: completed ? colors.primary : colors.onPrimary }}>{completed ? 'Undo' : 'Done'}</Text>
    </Pressable>
  </View>;
}
