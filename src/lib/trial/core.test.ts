import assert from 'node:assert/strict';
import { it } from 'node:test';
import { feedbackMailto, feedbackProblem, isMissingTable, shouldRecordUse } from './core';

it('validates feedback length', () => {
  assert.match(feedbackProblem('  a ') ?? '', /at least 3/);
  assert.match(feedbackProblem('x'.repeat(2001)) ?? '', /2,000/);
  assert.equal(feedbackProblem('Love the planner'), null);
});
it('records usage once per day unless the member opted out', () => {
  assert.equal(shouldRecordUse(null, '2026-05-01', false), true);
  assert.equal(shouldRecordUse('2026-05-01', '2026-05-01', false), false);
  assert.equal(shouldRecordUse('2026-04-30', '2026-05-01', true), false);
});
it('recognises a missing migration and builds an encoded mail fallback', () => {
  assert.equal(isMissingTable({ code: 'PGRST205' }), true);
  assert.equal(isMissingTable({ code: '23514', message: 'check violation' }), false);
  assert.equal(isMissingTable(null), false);
  assert.equal(feedbackMailto('hi@example.com', 'bug', 'Plan & swap'), 'mailto:hi@example.com?subject=Buko%20feedback%3A%20bug&body=Plan%20%26%20swap');
});
