import assert from 'node:assert/strict';
import test from 'node:test';
import { swipeDayDelta } from './swipe';

test('only successful deliberate horizontal swipes change day', () => {
  assert.equal(swipeDayDelta({ translationX: -80, translationY: 0 }, true, false), 1);
  assert.equal(swipeDayDelta({ translationX: 80, translationY: 0 }, true, false), -1);
  assert.equal(swipeDayDelta({ translationX: 80, translationY: 50 }, true, false), 0);
  assert.equal(swipeDayDelta({ translationX: 40, translationY: 0 }, true, false), 0);
  assert.equal(swipeDayDelta({ translationX: 80, translationY: 0 }, false, false), 0);
  assert.equal(swipeDayDelta({ translationX: 80, translationY: 0 }, true, true), 0);
});
