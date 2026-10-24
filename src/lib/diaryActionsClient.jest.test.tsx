import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mirrorDiaryTransfer } from './diaryActionsClient';
import { supabase } from './supabase';
import { maybeWriteNutrition, removeNutritionFromHealth } from './health';

jest.mock('./supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('./health', () => ({
  maybeWriteNutrition: jest.fn(),
  removeNutritionFromHealth: jest.fn(),
}));

const from = jest.mocked(supabase.from);
const writeNutrition = jest.mocked(maybeWriteNutrition);
const removeNutrition = jest.mocked(removeNutritionFromHealth);

function currentEntry(healthId: string | null) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => ({
      data: { id: 'entry-1', health_external_id: healthId },
      error: null,
    })),
    update: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  from.mockReset();
  writeNutrition.mockReset().mockResolvedValue('written');
  removeNutrition.mockReset().mockResolvedValue('removed');
});

describe('diary transfer health synchronization', () => {
  test('replay skips a write when the current entry already has a new health link', async () => {
    const query = currentEntry('already-written-health-id');
    from.mockReturnValue(query as never);

    const warning = await mirrorDiaryTransfer({
      changed: 1,
      skipped: 0,
      entries: [{ id: 'entry-1', health_external_id: null }],
    });

    expect(warning).toBeNull();
    expect(removeNutrition).not.toHaveBeenCalled();
    expect(writeNutrition).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  });

  test('failed deletion keeps the old health link and does not create a duplicate sample', async () => {
    const query = currentEntry('old-health-id');
    from.mockReturnValue(query as never);
    removeNutrition.mockResolvedValue('failed');

    const warning = await mirrorDiaryTransfer({
      changed: 1,
      skipped: 0,
      entries: [{ id: 'entry-1', health_external_id: 'old-health-id' }],
    });

    expect(warning).toContain('Its old link is kept');
    expect(removeNutrition).toHaveBeenCalledWith('old-health-id');
    expect(query.update).not.toHaveBeenCalled();
    expect(writeNutrition).not.toHaveBeenCalled();
  });

  test('an explicit health-write failure returns a warning after Buko changes are saved', async () => {
    const query = currentEntry(null);
    from.mockReturnValue(query as never);
    writeNutrition.mockResolvedValue('failed');

    const warning = await mirrorDiaryTransfer({
      changed: 1,
      skipped: 0,
      entries: [{ id: 'entry-1', health_external_id: null }],
    });

    expect(writeNutrition).toHaveBeenCalledWith('entry-1');
    expect(warning).toContain('Food saved in Buko, but could not be copied to your health app');
    expect(removeNutrition).not.toHaveBeenCalled();
  });
});
