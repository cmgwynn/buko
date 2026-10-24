import assert from 'node:assert/strict';
import test from 'node:test';
import { onboardingDraftKey, parseOnboardingDraft, type OnboardingAnswers } from './onboardingDraft';
test('setup drafts validate answers and expire after seven days', () => {
  const answers: OnboardingAnswers = { step: 2, goal: 'maintain', sex: null, birthYear: '1990', birthMonth: '1', birthDay: '1', units: 'metric', cm: '170', ft: '', inches: '', weight: '70', activity: null, diets: ['vegan'] };
  assert.deepEqual(parseOnboardingDraft(JSON.stringify({ savedAt: 1000, answers }), 2000), answers);
  assert.equal(parseOnboardingDraft(JSON.stringify({ savedAt: 1000, answers }), 8 * 86400000), null);
  assert.throws(() => parseOnboardingDraft(JSON.stringify({ savedAt: 1000, answers: { ...answers, step: 99 } }), 2000));
  assert.throws(() => parseOnboardingDraft(JSON.stringify({ savedAt: 1000, answers: { ...answers, diets: ['invalid'] } }), 2000));
  assert.notEqual(onboardingDraftKey('a'), onboardingDraftKey('b'));
});
