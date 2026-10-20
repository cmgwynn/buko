/**
 * Runtime configuration. Values come from `.env` (see `.env.example`).
 * Variables prefixed EXPO_PUBLIC_ are bundled into the app, so only put keys here
 * that are safe to be public (Supabase anon key is protected by row-level security).
 */
const env = process.env;

export const config = {
  supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  usdaApiKey: env.EXPO_PUBLIC_USDA_API_KEY ?? '',
  contactEmail: env.EXPO_PUBLIC_CONTACT_EMAIL ?? '',
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** Open Food Facts requires a descriptive User-Agent identifying the app and a contact. */
export const USER_AGENT = `Buko/1.0 (food scanner & nutrition tracker; contact: ${
  config.contactEmail || 'not-configured'
})`;
