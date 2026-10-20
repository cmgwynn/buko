# Buko

Scan products, rate them, track what you eat. See [PROJECT.md](./PROJECT.md) for the vision, phase plan and decisions log.

Phase 1 includes: email sign-up and onboarding with calorie/macro targets, a barcode scanner with an explainable 0–100 health score and better-product suggestions, a food diary with daily dashboard, and a grocery list.

## What you need
- A Mac/PC with [Node.js](https://nodejs.org) 20+ (LTS recommended)
- The **Expo Go** app on your iPhone or Android phone (App Store / Google Play)
- A free [Supabase](https://supabase.com) project
- A free [USDA FoodData Central API key](https://fdc.nal.usda.gov/api-key-signup)

## 1. Install
```bash
npm install
```

## 2. Set up Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql), and run it. Then do the same with [`0002_recipes_planning.sql`](./supabase/migrations/0002_recipes_planning.sql) (Phase 2: recipes, meal plan, pantry, photo storage). This creates the tables and turns on row-level security so each user can only read and write their own rows.
3. **Authentication → Providers → Email:** for easiest testing on phones, turn **off** "Confirm email". If you leave it on, new users must tap the link in their confirmation email before logging in (the app tells them so).
4. **Project Settings → API:** copy the **Project URL** and the **anon public** key.

## 3. Put your API keys in `.env`
```bash
cp .env.example .env
```
Edit `.env`:

| Variable | Where to get it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `EXPO_PUBLIC_USDA_API_KEY` | https://fdc.nal.usda.gov/api-key-signup |
| `EXPO_PUBLIC_CONTACT_EMAIL` | Your team's email. Sent in the User-Agent to Open Food Facts, whose API terms require identifying the app and a contact |

`.env` is git-ignored. Anything prefixed `EXPO_PUBLIC_` is bundled into the app, so **never** put a Supabase `service_role` key here. The anon key is safe because row-level security protects the data. Open Food Facts needs no key.

## 4. Run on your phone with Expo Go
```bash
npx expo start -c
```
(`-c` clears the cache; use it whenever you change `.env`.)

1. Make sure your phone and computer are on the **same Wi-Fi**.
2. **iPhone:** open the Camera app and scan the QR code in the terminal, then tap the Expo Go banner. **Android:** open Expo Go and tap "Scan QR code".
3. Allow camera access when asked (barcode scanning), photo access (recipe photos) and notifications (cooking timers).
4. If Expo Go says you must sign in to Expo CLI, run `npx expo login --sso` (use "Continue with GitHub"); a GitHub password does not work in the terminal.
5. If the QR code won't connect (guest Wi-Fi, VPN, firewall), run `npx expo start --tunnel` instead.

## Scripts
- `npm run typecheck` – TypeScript check
- `npm test` – unit tests for the scoring module and calorie targets

## Tuning the health score
All weights, thresholds, flagged additives and source citations live in [`src/lib/scoring/config.ts`](./src/lib/scoring/config.ts). Each factor's logic is in `factors.ts`. Change a number, run `npm test`, and the app picks it up. Scores are never stored, so there is nothing to migrate.

## Recipe import
Paste a recipe link and Buko fetches the page from your phone and reads only its structured schema.org Recipe data (ingredients, steps, servings, times). The source URL is always saved and shown. Sites without that data can't be imported; add the recipe by hand instead.

## Privacy
No analytics, advertising or tracking SDKs. Your data lives in your Supabase project. The only other network calls are food lookups to Open Food Facts and USDA FoodData Central, and the recipe page you ask to import.

## Data attribution
Product data is from [Open Food Facts](https://world.openfoodfacts.org) (Open Database License) and is credited in the app. Whole-food data is from [USDA FoodData Central](https://fdc.nal.usda.gov).

## Notes
- The health score and calorie targets are estimates, not medical advice.
- `.npmrc` sets `legacy-peer-deps` because of a React peer-dependency mismatch in the current Expo SDK.
