import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOfflineSession } from './offlineAuth';

test('offline workout identity requires the existing saved auth session, not an arbitrary owner id', () => {
  assert.equal(parseOfflineSession(null), null);
  assert.equal(parseOfflineSession(JSON.stringify({ user: { id: 'owner' } })), null);
  const stored = { user: { id: 'owner' }, access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: 1 };
  assert.equal(parseOfflineSession(JSON.stringify(stored))?.user.id, 'owner');
  assert.throws(() => parseOfflineSession('{broken'));
});
