import { APP_ID, type ActivityHint, type DayActivity, type HealthAdapter, type HealthFeature, type ImportedWorkout } from './types';

// The native module is loaded on demand so the app still starts in Expo Go, where it does not exist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hc(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-health-connect');
}

const TYPE: Record<ActivityHint, number> = { strength: 70, running: 56, walking: 79, cycling: 8, other: 0 };
const NAMES: Record<number, string> = { 8: 'Cycling', 56: 'Running', 70: 'Strength training', 79: 'Walking', 37: 'Hiking', 74: 'Swimming (pool)' };

const PERMS: Record<HealthFeature, { accessType: 'read' | 'write'; recordType: string }[]> = {
  read_steps: [{ accessType: 'read', recordType: 'Steps' }],
  read_active_energy: [{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }],
  read_workouts: [{ accessType: 'read', recordType: 'ExerciseSession' }],
  write_workouts: [{ accessType: 'write', recordType: 'ExerciseSession' }],
  write_nutrition: [{ accessType: 'write', recordType: 'Nutrition' }],
};

const iso = (d: Date) => d.toISOString();

export const healthConnectAdapter: HealthAdapter = {
  platform: 'health_connect',

  async isAvailable() {
    try {
      const m = hc();
      const status = await m.getSdkStatus();
      if (status !== m.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      return !!(await m.initialize());
    } catch {
      return false;
    }
  },

  async requestFeature(feature) {
    try {
      const granted = await hc().requestPermission(PERMS[feature]);
      return PERMS[feature].every((p) => granted.some((g: { accessType: string; recordType: string }) => g.accessType === p.accessType && g.recordType === p.recordType));
    } catch {
      return false;
    }
  },

  async readDay(day, want): Promise<DayActivity> {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 86400000);
    const timeRangeFilter = { operator: 'between', startTime: iso(start), endTime: iso(end) };
    const out: DayActivity = { steps: null, activeKcal: null };
    if (want.steps) {
      const r = await hc().aggregateRecord({ recordType: 'Steps', timeRangeFilter });
      out.steps = Math.round(r?.COUNT_TOTAL ?? 0);
    }
    if (want.activeEnergy) {
      const r = await hc().aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter });
      out.activeKcal = Math.round(r?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0);
    }
    return out;
  },

  async readWorkouts(since): Promise<ImportedWorkout[]> {
    const { records } = await hc().readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'after', startTime: iso(since) },
      ascendingOrder: false,
      pageSize: 100,
    });
    const out: ImportedWorkout[] = [];
    for (const r of records) {
      // Skip workouts Buko itself wrote, so a saved workout never comes back as a duplicate.
      if (r.metadata?.dataOrigin === APP_ID) continue;
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      let calories: number | null = null;
      try {
        const a = await hc().aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: { operator: 'between', startTime: r.startTime, endTime: r.endTime } });
        calories = Math.round(a?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0) || null;
      } catch {
        calories = null;
      }
      out.push({
        externalId: r.metadata?.id ?? `${r.startTime}`,
        name: r.title || NAMES[r.exerciseType] || 'Workout',
        start,
        end,
        durationMin: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
        calories,
      });
    }
    return out;
  },

  async writeWorkout(w) {
    const ids: string[] = await hc().insertRecords([
      { recordType: 'ExerciseSession', startTime: iso(w.start), endTime: iso(w.end), exerciseType: TYPE[w.hint], title: w.name },
    ]);
    return ids[0] ?? null;
  },

  async deleteWorkout(externalId) {
    await hc().deleteRecordsByUuids('ExerciseSession', [externalId], []);
  },

  async writeNutrition(n) {
    const ids: string[] = await hc().insertRecords([
      {
        recordType: 'Nutrition',
        startTime: iso(n.at),
        endTime: iso(new Date(n.at.getTime() + 60000)),
        name: n.name,
        mealType: 0,
        energy: { value: n.calories, unit: 'kilocalories' },
        protein: { value: n.protein_g, unit: 'grams' },
        totalCarbohydrate: { value: n.carbs_g, unit: 'grams' },
        totalFat: { value: n.fat_g, unit: 'grams' },
      },
    ]);
    return ids[0] ?? null;
  },

  async deleteNutrition(externalId) {
    await hc().deleteRecordsByUuids('Nutrition', [externalId], []);
  },
};
