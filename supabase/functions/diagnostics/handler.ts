import { crashEvent, diagnosticSignal } from '../../../src/lib/diagnostics/core.ts';
import { BodyError, boundedJson } from '../_shared/body.ts';
export function createDiagnosticsHandler(deps: {
  enabled: boolean; release: string;
  authenticate(token: string): Promise<string | null>;
  reserve(userId: string): Promise<boolean>;
  send(event: ReturnType<typeof crashEvent>): Promise<void>;
}) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return json({ error: 'Sign in first.' }, 401);
    try {
      const userId = await deps.authenticate(token);
      if (!userId) return json({ error: 'Sign in again.' }, 401);
      if (!deps.enabled) return json({ error: 'Optional diagnostic reporting is not configured. No report was sent.' }, 503);
      const body = await boundedJson(req, 512);
      const signal = diagnosticSignal(body);
      if (!signal) return json({ error: 'Only approved technical diagnostic fields are accepted.' }, 400);
      if (!await deps.reserve(userId)) return json({ error: 'Diagnostic limit reached.' }, 429);
      await deps.send(crashEvent(signal, deps.release));
      return json({ sent: true });
    } catch (error) {
      if (error instanceof BodyError) return json({ error: error.message }, error.status);
      console.error('Optional diagnostic delivery failed.');
      return json({ error: 'Diagnostic delivery failed. No delivery was confirmed.' }, 503);
    }
  };
}
