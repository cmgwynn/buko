import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { floorWarning, calculateTargets, MIN_AGE } from '../lib/nutrition/targets';
import { ageOnDate, birthDateFromParts } from '../lib/nutrition/birthday';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from '../lib/units';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useProfile } from '../providers/ProfileProvider';
import { colors, radius, spacing, typography } from '../theme';
import type { ActivityLevel, DietPref, Goal, Sex, Units } from '../types';
import { Body, Button, Card, Chip, ChipRow, Heading, Label, Notice, Screen, TextField } from './ui';

const GOALS: { key: Goal; title: string; desc: string }[] = [
  { key: 'lose', title: 'Lose weight', desc: 'A gentle deficit of about 0.5 kg (1 lb) a week.' },
  { key: 'maintain', title: 'Maintain weight', desc: 'Eat to match what you burn.' },
  { key: 'gain', title: 'Gain weight', desc: 'A modest surplus with extra protein.' },
];
const ACTIVITY: { key: ActivityLevel; title: string; desc: string }[] = [
  { key: 'sedentary', title: 'Sedentary', desc: 'Desk job, little exercise' },
  { key: 'light', title: 'Lightly active', desc: 'Exercise 1–3 days a week' },
  { key: 'moderate', title: 'Moderately active', desc: 'Exercise 3–5 days a week' },
  { key: 'active', title: 'Very active', desc: 'Hard exercise 6–7 days a week' },
  { key: 'very_active', title: 'Extremely active', desc: 'Physical job plus daily training' },
];
const DIETS: { key: DietPref; label: string }[] = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten_free', label: 'Gluten-free' },
  { key: 'dairy_free', label: 'Dairy-free' },
  { key: 'nut_free', label: 'Nut-free' },
];
const STEPS = ['Goal', 'About you', 'Body', 'Activity', 'Diet', 'Your plan'];

function Option({ title, desc, selected, onPress }: { title: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        padding: spacing.lg, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface,
      }}
    >
      <Text style={typography.subheading}>{title}</Text>
      <Text style={typography.small}>{desc}</Text>
    </Pressable>
  );
}

/** Multi-step profile form. Used for first-time onboarding and for editing details later. */
export function OnboardingFlow({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, refresh, today } = useProfile();

  const initialUnits: Units = profile?.units ?? 'imperial';
  const initialFt = profile ? cmToFtIn(profile.height_cm) : null;
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(profile?.goal ?? null);
  const [sex, setSex] = useState<Sex | null>(profile?.sex ?? null);
  const [birthYear, setBirthYear] = useState(profile?.birth_date?.slice(0, 4) ?? '');
  const [birthMonth, setBirthMonth] = useState(profile?.birth_date?.slice(5, 7) ?? '');
  const [birthDay, setBirthDay] = useState(profile?.birth_date?.slice(8, 10) ?? '');
  const [units, setUnits] = useState<Units>(initialUnits);
  const [cm, setCm] = useState(profile && initialUnits === 'metric' ? String(Math.round(profile.height_cm)) : '');
  const [ft, setFt] = useState(profile && initialFt ? String(initialFt.ft) : '');
  const [inches, setInches] = useState(profile && initialFt ? String(initialFt.inches) : '');
  const [weight, setWeight] = useState(
    profile ? String(Math.round(initialUnits === 'metric' ? profile.weight_kg : kgToLb(profile.weight_kg))) : '',
  );
  const [activity, setActivity] = useState<ActivityLevel | null>(profile?.activity_level ?? null);
  const [diets, setDiets] = useState<DietPref[]>(profile?.diet_prefs ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const birthDate = birthDateFromParts(birthYear, birthMonth, birthDay);
  const ageNum = ageOnDate(birthDate, new Date(`${today}T12:00:00`));
  const heightCm = units === 'metric' ? parseFloat(cm) : ftInToCm(parseInt(ft || '0', 10), parseFloat(inches || '0'));
  const weightKg = units === 'metric' ? parseFloat(weight) : lbToKg(parseFloat(weight));

  const ageOk = ageNum !== null && ageNum >= MIN_AGE && ageNum <= 100;
  const heightOk = heightCm >= 120 && heightCm <= 250;
  const weightOk = weightKg >= 30 && weightKg <= 300;

  const result = useMemo(() => {
    if (!goal || !sex || !activity || !ageOk || ageNum === null || !heightOk || !weightOk) return null;
    return calculateTargets({ goal, sex, age: ageNum, heightCm, weightKg, activityLevel: activity });
  }, [goal, sex, activity, ageNum, heightCm, weightKg, ageOk, heightOk, weightOk]);

  const canNext = [!!goal, !!sex && ageOk, heightOk && weightOk, !!activity, true, !!result][step];

  const toggleDiet = (d: DietPref) =>
    setDiets((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  async function save() {
    if (busy || !result || !birthDate || !goal || !sex || !activity || !session) return;
    setBusy(true);
    setError(null);
    const userId = session.user.id;
    const now = new Date().toISOString();
    const p = await supabase.from('profiles').upsert({
      user_id: userId, goal, sex, birth_year: Number(birthYear), birth_date: birthDate,
      height_cm: Math.round(heightCm * 10) / 10, weight_kg: Math.round(weightKg * 10) / 10,
      activity_level: activity, diet_prefs: diets, units, updated_at: now,
    });
    const t = p.error ? null : await supabase.from('nutrition_targets').upsert({
      user_id: userId, calories: result.calories, protein_g: result.proteinG, carbs_g: result.carbsG,
      fat_g: result.fatG, bmr: result.bmr, tdee: result.tdee, floor_applied: result.floorApplied, updated_at: now,
    });
    const err = p.error ?? t?.error;
    if (err) {
      const missingBirthdayColumn = p.error && (p.error.code === 'PGRST204' || p.error.code === '42703') && p.error.message.includes('birth_date');
      setError(missingBirthdayColumn
        ? 'Birthday storage is not enabled yet. The app owner needs to run database migration 0004_profile_birthdays.sql. Your changes were not saved.'
        : t?.error ? `Your profile was saved, but saving its targets failed: ${err.message}. Please retry Save.` : err.message);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
    if (editing) router.back();
  }

  const warning = result ? floorWarning(result) : null;

  return (
    <Screen variant="form" edges={editing ? [] : ['top', 'bottom']}>
      <Text style={[typography.label, { marginTop: spacing.md }]}>
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4, marginVertical: spacing.md }}>
        {STEPS.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.border }} />
        ))}
      </View>

      {step === 0 && (
        <>
          <Heading>What&apos;s your goal?</Heading>
          <View style={{ height: spacing.md }} />
          {GOALS.map((g) => <Option key={g.key} title={g.title} desc={g.desc} selected={goal === g.key} onPress={() => setGoal(g.key)} />)}
        </>
      )}

      {step === 1 && (
        <>
          <Heading>About you</Heading>
          <View style={{ height: spacing.md }} />
          <Label>Sex used for the calorie formula</Label>
          <ChipRow>
            <Chip label="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
            <Chip label="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
            <Chip label="Prefer not to say" selected={sex === 'unspecified'} onPress={() => setSex('unspecified')} />
          </ChipRow>
          <Body muted>The Mifflin-St Jeor equation differs slightly by sex. &quot;Prefer not to say&quot; uses the average of the two.</Body>
          <View style={{ height: spacing.lg }} />
          <Label>Birthday</Label>
          <Body muted>Your birthday stays in your private profile. Age and formula-based targets update automatically on your birthday.</Body>
          {profile && !profile.birth_date ? <Notice tone="info">We previously stored only an approximate birth year. Please enter your actual birthday once; we will not guess it.</Notice> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><TextField label="Month" value={birthMonth} onChangeText={setBirthMonth} keyboardType="number-pad" maxLength={2} placeholder="MM" /></View>
            <View style={{ flex: 1 }}><TextField label="Day" value={birthDay} onChangeText={setBirthDay} keyboardType="number-pad" maxLength={2} placeholder="DD" /></View>
            <View style={{ flex: 1.4 }}><TextField label="Year" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} placeholder="YYYY" /></View>
          </View>
          {birthYear || birthMonth || birthDay ? (
            ageOk ? <Body muted>Age {ageNum} · updates automatically</Body>
              : <Notice tone="danger">Enter a valid birthday. Buko is for adults aged {MIN_AGE}–100.</Notice>
          ) : null}
        </>
      )}

      {step === 2 && (
        <>
          <Heading>Height & weight</Heading>
          <View style={{ height: spacing.md }} />
          <ChipRow>
            <Chip label="lb / ft" selected={units === 'imperial'} onPress={() => { setUnits('imperial'); setCm(''); setWeight(''); }} />
            <Chip label="kg / cm" selected={units === 'metric'} onPress={() => { setUnits('metric'); setFt(''); setInches(''); setWeight(''); }} />
          </ChipRow>
          <View style={{ height: spacing.lg }} />
          {units === 'metric' ? (
            <TextField label="Height (cm)" value={cm} onChangeText={setCm} keyboardType="decimal-pad" placeholder="e.g. 170" />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}><TextField label="Height (ft)" value={ft} onChangeText={setFt} keyboardType="number-pad" placeholder="5" /></View>
              <View style={{ flex: 1 }}><TextField label="(in)" value={inches} onChangeText={setInches} keyboardType="decimal-pad" placeholder="9" /></View>
            </View>
          )}
          <TextField label={`Weight (${units === 'metric' ? 'kg' : 'lb'})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={units === 'metric' ? 'e.g. 70' : 'e.g. 155'} />
          {(cm || ft) && !heightOk ? <Notice tone="danger">Please enter a height between 120 and 250 cm (about 4′ to 8′2″).</Notice> : null}
          {weight && !weightOk ? <Notice tone="danger">Please enter a weight between 30 and 300 kg (66–660 lb).</Notice> : null}
        </>
      )}

      {step === 3 && (
        <>
          <Heading>How active are you?</Heading>
          <View style={{ height: spacing.md }} />
          {ACTIVITY.map((a) => <Option key={a.key} title={a.title} desc={a.desc} selected={activity === a.key} onPress={() => setActivity(a.key)} />)}
        </>
      )}

      {step === 4 && (
        <>
          <Heading>Dietary preferences</Heading>
          <View style={{ height: spacing.sm }} />
          <Body muted>Optional. We&apos;ll flag scanned products that conflict with these. They don&apos;t change your calorie targets.</Body>
          <View style={{ height: spacing.lg }} />
          <ChipRow>
            {DIETS.map((d) => <Chip key={d.key} label={d.label} selected={diets.includes(d.key)} onPress={() => toggleDiet(d.key)} />)}
          </ChipRow>
        </>
      )}

      {step === 5 && result && (
        <>
          <Heading>Your daily plan</Heading>
          <View style={{ height: spacing.md }} />
          {warning ? <Notice tone="danger">{warning}</Notice> : null}
          <Card>
            <Text style={{ fontSize: 44, fontWeight: '800', color: colors.primary }}>{result.calories.toLocaleString()}</Text>
            <Body muted>calories per day</Body>
            <View style={{ flexDirection: 'row', marginTop: spacing.lg }}>
              {[['Protein', result.proteinG, colors.macro.protein], ['Carbs', result.carbsG, colors.macro.carbs], ['Fat', result.fatG, colors.macro.fat]].map(([l, v, c]) => (
                <View key={l as string} style={{ flex: 1 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: c as string }}>{v}g</Text>
                  <Text style={typography.small}>{l}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Body muted>
            Calculated with the Mifflin-St Jeor equation: resting burn {result.bmr.toLocaleString()} kcal, about {result.tdee.toLocaleString()} kcal with your activity level.
            These are estimates, not medical advice.
          </Body>
          {error ? <View style={{ marginTop: spacing.md }}><Notice tone="danger">{error}</Notice></View> : null}
        </>
      )}

      <View style={{ marginTop: spacing.xl }}>
        {step < STEPS.length - 1 ? (
          <Button title="Continue" onPress={() => setStep(step + 1)} disabled={!canNext} />
        ) : (
          <Button title={editing ? 'Save changes' : 'Start using Buko'} onPress={save} loading={busy} disabled={!canNext} />
        )}
        {step > 0 ? <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} /> : null}
        {!editing && step === 0 ? <Button title="Sign out" variant="ghost" onPress={() => supabase.auth.signOut()} /> : null}
      </View>
    </Screen>
  );
}
