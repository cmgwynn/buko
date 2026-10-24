import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contributorLabel, validatePublicAlias } from '../communityProfiles';

describe('public recipe aliases', () => {
  it('accepts bounded pseudonyms and treats blank as no alias', () => {
    assert.deepEqual(validatePublicAlias('  Lentil Fan '), { alias: 'Lentil Fan', error: null });
    assert.deepEqual(validatePublicAlias('cook_42.b-x'), { alias: 'cook_42.b-x', error: null });
    assert.deepEqual(validatePublicAlias('   '), { alias: null, error: null });
  });
  it('rejects emails, symbols, spacing abuse, length and official-sounding names', () => {
    for (const bad of ['ab', 'me@example.com', 'x'.repeat(31), 'two  spaces', '-dash', 'dash-', 'Buko Team', 'the moderator', 'Support', 'Chef 🍳']) {
      assert.ok(validatePublicAlias(bad).error, bad);
    }
    assert.equal(validatePublicAlias('Bukowski fan').error, null);
  });
  it('falls back to a generic member label when no visible alias exists', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    assert.equal(contributorLabel(id, {}), 'Member 11111111');
    assert.equal(contributorLabel(id, { [id]: 'Lentil Fan' }), 'Lentil Fan');
  });
});
