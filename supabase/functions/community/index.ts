import { createCommunityHandler } from './handler.ts';

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const base = Deno.env.get('SUPABASE_URL');
const anon = Deno.env.get('SUPABASE_ANON_KEY');
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!base || !anon || !service) throw new Error('Missing recipe-sharing server configuration.');
Deno.serve(createCommunityHandler({ base, anon, service }));
