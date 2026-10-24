import assert from 'node:assert/strict';
import { it } from 'node:test';
import { crashEvent, diagnosticSignal } from './core';
import { createDiagnosticsHandler } from '../../../supabase/functions/diagnostics/handler';
it('rejects all arbitrary data and constructs only allowlisted provider events', () => {
  const valid = { code: 'render_failure', platform: 'ios', fatal: true };
  assert.deepEqual(diagnosticSignal(valid), valid);
  for (const invalid of [{ ...valid, email: 'private@example.test' }, { ...valid, health: 75 }, { ...valid, message: 'secret' },
    { ...valid, code: 'my private recipe' }, { ...valid, platform: 'my phone name' }]) assert.equal(diagnosticSignal(invalid), null);
  assert.deepEqual(crashEvent({ code: 'render_failure', platform: 'ios', fatal: true }, '1.0.0'), {
    platform: 'other', release: 'buko@1.0.0', level: 'fatal', message: 'render_failure',
    tags: { runtime: 'ios', diagnostic: 'render_failure' },
  });
});
it('does not forward auth identity, arbitrary fields or disabled reports and applies quotas', async () => {
  let sent: unknown = null;
  const handler = (enabled = true, allowed = true) => createDiagnosticsHandler({
    enabled, release: '1.0.0', authenticate: async () => 'private-account-id',
    reserve: async () => allowed, send: async (event) => { sent = event; },
  });
  const request = (body: unknown, auth = true) => new Request('https://example.test/diagnostics', {
    method: 'POST', headers: auth ? { Authorization: 'Bearer private-session' } : {}, body: JSON.stringify(body),
  });
  const valid = { code: 'unhandled_js', platform: 'web', fatal: false };
  assert.equal((await handler()(request(valid, false))).status, 401);
  assert.equal((await handler(false)(request(valid))).status, 503);
  assert.equal((await handler()(request({ ...valid, message: 'health text' }))).status, 400);
  assert.equal((await handler(true, false)(request(valid))).status, 429);
  assert.equal(sent, null);
  assert.equal((await handler()(request(valid))).status, 200);
  assert.ok(!JSON.stringify(sent).includes('private'));
  assert.equal((await handler()(request({ ...valid, blob: 'a'.repeat(600) }))).status, 413);
});
