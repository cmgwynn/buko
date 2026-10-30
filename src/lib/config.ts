/**
 * Runtime configuration. Values come from `.env` (see `.env.example`).
 * Variables prefixed EXPO_PUBLIC_ are bundled into the app, so only put keys here
 * that are safe to be public (Supabase anon key is protected by row-level security).
 */
// Expo only bundles public variables accessed directly through process.env.
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  usdaApiKey: process.env.EXPO_PUBLIC_USDA_API_KEY ?? '',
  contactEmail: process.env.EXPO_PUBLIC_CONTACT_EMAIL ?? '',
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  premiumEnforcement: process.env.EXPO_PUBLIC_PREMIUM_ENFORCEMENT === 'true',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  /** Shows "Order on Instacart" on Groceries. Requires the grocery-order function and an Instacart API key. */
  groceryOrdering: process.env.EXPO_PUBLIC_GROCERY_ORDERING === 'true',
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** Open Food Facts requires a descriptive User-Agent identifying the app and a contact. */
export const USER_AGENT = `Buko/1.0 (food scanner & nutrition tracker; contact: ${
  config.contactEmail || 'not-configured'
})`;
