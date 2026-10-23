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
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql), and run it. Then do the same, each as a **new query**, with [`0002_recipes_planning.sql`](./supabase/migrations/0002_recipes_planning.sql) (Phase 2: recipes, meal plan, pantry, photo storage) and [`0003_fitness.sql`](./supabase/migrations/0003_fitness.sql) (Phase 3: workouts, exercises, body stats, health data, settings). This creates the tables and turns on row-level security so each user can only read and write their own rows.
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

## Run in a web browser
```bash
npm run web
```

Open the URL shown by Expo. The same Supabase and USDA environment variables are used on web; add them to `.env` before starting. Barcode lookup is available by entering a barcode manually. Camera scanning and Apple Health / Health Connect require the mobile app.

To create a static web export for hosting:
```bash
npm run build:web
```

The GitHub Pages deployment runs from `main` and publishes the web app at https://cmgwynn.github.io/buko/. Its Actions environment needs the four `EXPO_PUBLIC_*` values from `.env` configured as repository Actions secrets.

Expo embeds these values at build time. Access them directly as `process.env.EXPO_PUBLIC_*` in app code, without aliasing or destructuring `process.env`. Changes to deployment secrets require a new deployment. The workflow rejects missing or invalid Supabase settings before exporting.

### Responsive layout
The app uses the full width on phones and a centered frame (up to 1040 px) on desktop. Content is capped at 880 px and forms at 520 px. Diary meals and recipe lists switch from one to two columns when space permits; a lone card keeps its column width instead of stretching across the row. Rotating a phone reflows the layout without losing the current screen; short landscape windows use less top spacing and scrollable scanner/cooking controls.

Native builds allow portrait and landscape orientations. Existing installed native builds need rebuilding to pick up the orientation setting; the browser version adapts immediately.

## Phase 3: fitness and health data
Workouts, the exercise library, routines, progress charts and the activity-adjusted calorie target all work in **Expo Go**. Apple Health and Health Connect need a **development build** (Expo Go can't include them). Until then, the Health settings screen says so.

### Switching from Expo Go to a development build (EAS cloud build)
You don't have Xcode, so we build in Expo's cloud.
1. **Expo account:** create one at expo.dev, then run `npx expo login --sso` (Continue with GitHub).
2. **Link the project:** `npx eas-cli init` (accept creating the project).
3. **iPhone:**
   - HealthKit needs an **Apple Developer Program** membership (US$99/year). Free Apple IDs can't use the HealthKit capability or EAS device builds. Enrol at developer.apple.com/programs.
   - Register your phone: `npx eas-cli device:create`, then open the link on your iPhone and install the profile.
   - On the iPhone, turn on **Settings › Privacy & Security › Developer Mode** and restart.
   - Build: `npx eas-cli build --profile development --platform ios` (sign in with your Apple ID when asked; it takes ~15 minutes). Open the build link or QR code on the phone to install.
4. **Android:** `npx eas-cli build --profile development --platform android`, then open the link on the phone and install the APK. Health Connect is built into Android 14+; on older versions install it from the Play Store.
5. **Run:** `npx expo start --dev-client` and open the Buko app you installed (not Expo Go).
6. Rebuild whenever native dependencies or `app.json` plugins change; normal code changes reload without rebuilding.
7. Your `.env` keys are read by Metro on your computer, so they work in the dev build without uploading them to EAS.

Before public release, Apple and Google each require a published privacy policy, and Google Play needs a Health Connect permissions declaration.

## Scripts
- `npm run typecheck` – TypeScript check
- `npm test` – unit tests for the scoring module and calorie targets

## Tuning the health score
All weights, thresholds, flagged additives and source citations live in [`src/lib/scoring/config.ts`](./src/lib/scoring/config.ts). Each factor's logic is in `factors.ts`. Change a number, run `npm test`, and the app picks it up. Scores are never stored, so there is nothing to migrate.

## Recipe import
Paste a recipe link and Buko fetches the page from your phone and reads only its structured schema.org Recipe data (ingredients, steps, servings, times). The source URL is always saved and shown. Sites without that data can't be imported; add the recipe by hand instead.

## Privacy
No analytics, advertising or tracking SDKs. Health data from Apple Health or Health Connect is only used when you turn a feature on, is never used for advertising and is never shared with third parties. Your data lives in your Supabase project. The only other network calls are food lookups to Open Food Facts and USDA FoodData Central, and the recipe page you ask to import.

## Data attribution
Product data is from [Open Food Facts](https://world.openfoodfacts.org) (Open Database License) and is credited in the app. Whole-food data is from [USDA FoodData Central](https://fdc.nal.usda.gov).

## Notes
- The health score and calorie targets are estimates, not medical advice.
- `.npmrc` sets `legacy-peer-deps` because of a React peer-dependency mismatch in the current Expo SDK.
