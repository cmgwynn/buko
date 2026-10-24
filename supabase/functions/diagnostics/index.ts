import { createDiagnosticsHandler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!url || !anon || !service) throw new Error('Missing diagnostic relay configuration.');
const dsn = Deno.env.get('SENTRY_DSN');
const enabled = Deno.env.get('DIAGNOSTICS_ENABLED') === 'true' && Boolean(dsn);
const release = Deno.env.get('DIAGNOSTIC_RELEASE') ?? '1.0.0';
if (!/^\d+\.\d+\.\d+$/.test(release)) throw new Error('Invalid diagnostic release.');
Deno.serve(createDiagnosticsHandler({
  enabled, release,
  async authenticate(token) {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const user = await response.json();
    return typeof user.id === 'string' ? user.id : null;
  },
  async reserve(userId) {
    const response = await fetch(`${url}/rest/v1/rpc/reserve_diagnostic`, {
      method: 'POST', headers: { Authorization: `Bearer ${service}`, apikey: service, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Diagnostic quota unavailable.'); }
    return await response.json() === true;
  },
  async send(event) {
    const destination = new URL(dsn!);
    const project = destination.pathname.split('/').filter(Boolean).pop();
    if (destination.protocol !== 'https:' || !destination.username || !/^\d+$/.test(project ?? '')) throw new Error('Invalid crash provider configuration.');
    const publicKey = destination.username;
    destination.username = ''; destination.password = '';
    destination.pathname = `/api/${project}/envelope/`;
    destination.search = `sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7`;
    const eventId = crypto.randomUUID().replaceAll('-', '');
    const body = `${JSON.stringify({ event_id: eventId })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify({ ...event, event_id: eventId })}`;
    const response = await fetch(destination, {
      method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body, signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('Crash provider delivery failed.');
  },
}));
