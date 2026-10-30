import { beforeEach, expect, jest, test } from '@jest/globals';
import { saveTrainingSlot } from '../progressionStorage';
import { generateTrainingPlan } from '../progression';
import type { PlannedWorkoutRow } from '../data';

const mockCreate = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCache = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockSelect = jest.fn<() => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>>();
const mockQuery = {
  update: jest.fn(), eq: jest.fn(), is: jest.fn(), select: mockSelect,
};
jest.mock('../data', () => ({
  savePlannedWorkout: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('../../supabase', () => ({ supabase: { from: () => mockQuery } }));
jest.mock('../offline', () => ({
  getFitnessOfflineSnapshot: async () => ({ plannedWorkouts: [] }),
  cachePlannedWorkouts: (...args: unknown[]) => mockCache(...args),
}));

const day = generateTrainingPlan({
  startDate: '2026-11-02', comfortableMinutes: 10, comfortableRunsPerWeek: 2,
  preferredRunDays: [1, 3], runWalk: true, includeStrength: false,
}, [{ id: 'run', name: 'Running', category: 'cardio', user_id: null, muscle_groups: [], equipment: null, met: 4 }], [], '2026-10-29').days[0];
const replacement: PlannedWorkoutRow = {
  id: 'slot', user_id: 'owner', planned_for: day.date, name: 'Old plan',
  routine_id: null, notes: null, snapshot: [], completed_workout_id: null, updated_at: 'version',
};

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue(undefined);
  mockCache.mockReset().mockResolvedValue(undefined);
  mockQuery.update.mockReturnValue(mockQuery);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.is.mockReturnValue(mockQuery);
  mockSelect.mockReset().mockResolvedValue({ data: [{ id: 'slot' }], error: null });
});
test('new slots use the existing planned-workout save helper without an existing id', async () => {
  await saveTrainingSlot('owner', { day, replace: null });
  expect(mockCreate).toHaveBeenCalledWith('owner', expect.objectContaining({ planned_for: day.date, snapshot: day.snapshot, routine_id: null }));
  expect(mockQuery.update).not.toHaveBeenCalled();
});
test('replacement writes atomically guard owner, version and uncompleted state', async () => {
  await saveTrainingSlot('owner', { day, replace: replacement });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockQuery.eq).toHaveBeenCalledWith('user_id', 'owner');
  expect(mockQuery.eq).toHaveBeenCalledWith('id', 'slot');
  expect(mockQuery.eq).toHaveBeenCalledWith('updated_at', 'version');
  expect(mockQuery.is).toHaveBeenCalledWith('completed_workout_id', null);
  expect(mockCache).toHaveBeenCalledWith('owner', [expect.objectContaining({ id: 'slot', name: day.name, snapshot: day.snapshot })]);
});
test('concurrent completion/change fails without fallback upsert', async () => {
  mockSelect.mockResolvedValue({ data: [], error: null });
  await expect(saveTrainingSlot('owner', { day, replace: replacement })).rejects.toThrow('was not replaced');
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockCache).not.toHaveBeenCalled();
});
test('completed or unversioned slots cannot be replaced', async () => {
  for (const patch of [{ completed_workout_id: 'done' }, { updated_at: undefined }, { user_id: 'other' }]) {
    await expect(saveTrainingSlot('owner', { day, replace: { ...replacement, ...patch } })).rejects.toThrow('cannot be verified');
  }
  expect(mockQuery.update).not.toHaveBeenCalled();
});
