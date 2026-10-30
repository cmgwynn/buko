import assert from 'node:assert/strict';
import { it } from 'node:test';
import { adMode } from './policy';

const base = { enabled: true, plus: false, placement: 'recipes-browse', workoutActive: false };
it('shows nothing unless ads are enabled, the member is not on Plus and no workout is running', () => {
  assert.equal(adMode(base), 'house');
  assert.equal(adMode({ ...base, enabled: false }), 'none');
  assert.equal(adMode({ ...base, plus: true }), 'none');
  assert.equal(adMode({ ...base, workoutActive: true }), 'none');
});
it('never allows logging, scanning or workout placements', () => {
  for (const placement of ['diary', 'log-search', 'scan', 'workout', 'cook']) assert.equal(adMode({ ...base, placement }), 'none');
  assert.equal(adMode({ ...base, placement: 'progress' }), 'house');
});
