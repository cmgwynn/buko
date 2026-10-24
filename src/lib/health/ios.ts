import { APP_ID, healthWorkoutClientRecordId, type ActivityHint, type DayActivity, type HealthAdapter, type HealthFeature, type ImportedWorkout } from './types';

// The native module is loaded on demand so the app still starts in Expo Go, where it does not exist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hk(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@kingstinct/react-native-healthkit');
}

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const ACTIVE = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const WORKOUT = 'HKWorkoutTypeIdentifier';
const DIETARY = {
  energy: 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  protein: 'HKQuantityTypeIdentifierDietaryProtein',
  carbs: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
  fat: 'HKQuantityTypeIdentifierDietaryFatTotal',
} as const;

const ACTIVITY_NAMES: Record<number, string> = {
  13: 'Cycling', 16: 'Elliptical', 20: 'Strength training', 24: 'Hiking', 35: 'Rowing', 37: 'Running', 46: 'Swimming', 50: 'Strength training', 52: 'Walking',
};

function activityType(hint: ActivityHint): number {
  const T = hk().WorkoutActivityType;
  return { strength: T.traditionalStrengthTraining, running: T.running, walking: T.walking, cycling: T.cycling, other: T.other }[hint];
}

export const healthKitAdapter: HealthAdapter = {
  platform: 'healthkit',
  supportsWorkoutIdempotency: true,

  async isAvailable() {
    try {
      return !!(await hk().isHealthDataAvailableAsync());
    } catch {
      return false;
    }
  },

  async requestFeature(feature: HealthFeature) {
    const req: { toRead?: string[]; toShare?: string[] } = {};
    if (feature === 'read_steps') req.toRead = [STEPS];
    if (feature === 'read_active_energy') req.toRead = [ACTIVE];
    if (feature === 'read_workouts') req.toRead = [WORKOUT];
    if (feature === 'write_workouts') req.toShare = [WORKOUT];
    if (feature === 'write_nutrition') req.toShare = Object.values(DIETARY);
    try {
      // iOS deliberately never tells an app whether *read* access was granted; this only says the prompt was shown.
      return !!(await hk().requestAuthorization(req));
    } catch {
      return false;
    }
  },

  async readDay(day, want): Promise<DayActivity> {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 86400000);
    const opts = (unit: string) => ({ filter: { date: { startDate: start, endDate: end } }, unit });
    const out: DayActivity = { steps: null, activeKcal: null };
    if (want.steps) {
      const r = await hk().queryStatisticsForQuantity(STEPS, ['cumulativeSum'], opts('count'));
      out.steps = Math.round(r?.sumQuantity?.quantity ?? 0);
    }
    if (want.activeEnergy) {
      const r = await hk().queryStatisticsForQuantity(ACTIVE, ['cumulativeSum'], opts('kcal'));
      out.activeKcal = Math.round(r?.sumQuantity?.quantity ?? 0);
    }
    return out;
  },

  async readWorkouts(since): Promise<ImportedWorkout[]> {
    const list = await hk().queryWorkoutSamples({ limit: 100, ascending: false, filter: { date: { startDate: since } } });
    const out: ImportedWorkout[] = [];
    for (const w of list) {
      const j = typeof w.toJSON === 'function' ? w.toJSON() : w;
      if (typeof w.dispose === 'function') w.dispose();
      // Skip workouts Buko itself wrote, so a saved workout never comes back as a duplicate.
      if (j.sourceRevision?.source?.bundleIdentifier === APP_ID) continue;
      const start = new Date(j.startDate);
      const end = new Date(j.endDate);
      out.push({
        externalId: j.uuid,
        name: ACTIVITY_NAMES[j.workoutActivityType] ?? 'Workout',
        start,
        end,
        durationMin: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
        calories: j.totalEnergyBurned ? Math.round(j.totalEnergyBurned.quantity) : null,
      });
    }
    return out;
  },

  async writeWorkout(w) {
    const syncId = w.clientId ? healthWorkoutClientRecordId(w.clientId) : null;
    if (syncId) {
      // HealthKit keeps one object per (source, sync identifier); return the earlier save if it already exists.
      const existing = await hk().queryWorkoutSamples({
        limit: 1,
        filter: { metadata: { withMetadataKey: 'HKSyncIdentifier', operatorType: 4 /* ComparisonPredicateOperator.equalTo */, value: syncId } },
      });
      const found = existing?.[0]?.uuid ?? null;
      if (found) return found;
    }
    const saved = await hk().saveWorkoutSample(
      activityType(w.hint),
      [],
      w.start,
      w.end,
      { energyBurned: w.calories ?? undefined, distance: w.distanceM ?? undefined },
      syncId ? { HKSyncIdentifier: syncId, HKSyncVersion: 1 } : undefined,
    );
    const id = saved?.uuid ?? null;
    if (typeof saved?.dispose === 'function') saved.dispose();
    return id;
  },

  async deleteWorkout(externalId) {
    await hk().deleteObjects(WORKOUT, { uuid: externalId });
  },

  async writeNutrition(n) {
    const save = async (id: string, unit: string, value: number) => (await hk().saveQuantitySample(id, unit, value, n.at, n.at, { BukoFood: n.name }))?.uuid as string | undefined;
    const ids = [
      await save(DIETARY.energy, 'kcal', n.calories),
      await save(DIETARY.protein, 'g', n.protein_g),
      await save(DIETARY.carbs, 'g', n.carbs_g),
      await save(DIETARY.fat, 'g', n.fat_g),
    ];
    // One id string covers all four samples, in the order energy, protein, carbs, fat.
    return ids.every(Boolean) ? ids.join(',') : null;
  },

  async deleteNutrition(externalId) {
    const [e, p, c, f] = externalId.split(',');
    const pairs: [string, string | undefined][] = [[DIETARY.energy, e], [DIETARY.protein, p], [DIETARY.carbs, c], [DIETARY.fat, f]];
    for (const [type, uuid] of pairs) if (uuid) await hk().deleteObjects(type, { uuid });
  },
};
