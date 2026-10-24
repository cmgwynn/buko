import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authenticationTime } from '../../../supabase/functions/account/authorization';

describe('verified account authentication time', () => {
  const id = 'owner';
  const lastSignIn = '2026-10-24T03:00:00Z';
  const time = Date.parse(lastSignIn) / 1000;
  it('uses password authentication time, not access-token refresh time', () => {
    assert.equal(authenticationTime({ sub: id, iat: time, amr: [{ method: 'password', timestamp: time - 3600 }] }, id, lastSignIn), time - 3600);
  });
  it('does not let a separate recent sign-in upgrade an old session', () => {
    assert.equal(authenticationTime({ sub: id, amr: [{ method: 'password', timestamp: time - 3600 }] }, id, lastSignIn), time - 3600);
  });
  it('caps AMR time at the auth server’s last sign-in', () => {
    assert.equal(authenticationTime({ sub: id, amr: [{ method: 'password', timestamp: time + 5 }] }, id, lastSignIn), time);
  });
  it('rejects missing, anonymous, malformed or mismatched claims', () => {
    for (const claims of [
      { sub: 'other', amr: [{ method: 'password', timestamp: time }] },
      { sub: id, iat: time },
      { sub: id, amr: [{ method: 'anonymous', timestamp: time }] },
      { sub: id, amr: [{ method: 'password', timestamp: 'now' }, null] },
    ]) assert.ok(!Number.isFinite(authenticationTime(claims, id, lastSignIn)));
  });
});
