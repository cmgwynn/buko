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
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql), and run it. Then do the same, each as a **new query**, with [`0002_recipes_planning.sql`](./supabase/migrations/0002_recipes_planning.sql) (Phase 2: recipes, meal plan, pantry, photo storage), [`0003_fitness.sql`](./supabase/migrations/0003_fitness.sql) (Phase 3: fitness and health), and [`0004_profile_birthdays.sql`](./supabase/migrations/0004_profile_birthdays.sql) (birthday-based age). This creates the tables and turns on row-level security so each user can only read and write their own rows. For an existing database, run only migrations that have not already been applied.
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

### Interaction and visual design
Buko shares an iOS-inspired visual system across native and web: rounded surfaces, clear focus states, and a highlighted active tab. The palette follows the green coconut logo: forest-green actions, soft cream backgrounds, white cards, and warm shell-brown secondary text and wordmark accents. Health-score and macro colors retain their distinct meanings. Buttons, chips, profile actions, and recipe cards use subtle Reanimated spring feedback; macro bars animate changes and tabs fade between screens. Motion respects the device/browser reduced-motion preference. There are no separate web-only Tailwind or Motion dependencies.

### Starter libraries and routines
- **Recipes → Browse recipe library:** 12 original, simple recipes across breakfast, lunch, dinner and snacks. Preview ingredients/steps, tap **Use**, customize the draft and **Save recipe** to add a private copy. Library originals stay unchanged. Nutrition comes from ingredient matching; it is not pre-certified. Check ingredients for allergies.
- **Train → Browse workout library:** six starter sessions covering bodyweight, dumbbells, gym and gentle cardio. **Customize** opens the routine editor; **Save routine** adds an independent template without logging a workout.
- **Train → Create routine**, or **Edit** on a saved routine: rename, add/remove/reorder exercises and change sets, reps, weight, time and cardio distance. Targets use your preferred units and are per set. Changes affect future sessions only, not logged workouts or a session already in progress.
- **Delete workout** now uses an in-app confirmation on web and native, with Cancel and explicit error feedback. Saved routines are retained. Deleting an imported workout does not delete its original health-app record, which may import again on a later sync.

These features use the existing fitness migration; no new backend deployment is required. Routine edits use several database requests. If an edit fails partway through, the app explicitly requires a reload before retrying; a failed newly created routine is cleaned up where possible.

The temporary coconut mark is original artwork in [`assets/coconut.svg`](./assets/coconut.svg), with a matching native SVG component and generated app/favicon assets. It appears on authentication screens and tab headers. Native app icon changes require rebuilding the app; web branding updates with the next page load.

### Birthday-based age and automation
Before deploying the birthday UI to an existing installation, run [`0004_profile_birthdays.sql`](./supabase/migrations/0004_profile_birthdays.sql) in **Supabase → SQL Editor → New query**. It adds a private, nullable `profiles.birth_date`, keeps existing data and owner-only RLS, and refreshes the API schema. The birthday migration is safe to rerun: it keeps an existing birthday column and named validation constraint instead of recreating them. If an older copy reports `constraint "profiles_birth_date_valid" already exists`, rerun the complete updated file in a new query. No birthday is inferred for existing users. The old app continues working after the migration.

Onboarding and **Profile → Update details & recalculate** ask for month, day and year instead of age. The app requires a valid birthday for ages 18–100 when saving the form. Existing users retain their stored targets and approximate age until they choose to enter their actual birthday.

For profiles with a birthday, completed age and formula-based calorie/macro targets update on the device at local midnight and when the app resumes. A Feb 29 birthday advances March 1 in non-leap years. Profile and activity-adjusted diary targets share the same age calculation. Birthday target changes are derived on-device, not background database jobs: they do not rewrite food logs, saved targets, goals or preferences. If migration `0004` has not been applied, birthday saves show a setup error instead of silently dropping the date.

Phase 4 remains planned, not implemented: customization will guide automation through user goals, preferences and constraints, with explanations, safety limits, pause and override controls. See [PROJECT.md](./PROJECT.md#phase-4-design-direction).

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
Paste a recipe link and Buko reads only its structured schema.org Recipe data (ingredients, steps, servings, times). The source URL is always saved and shown. Sites without that data can't be imported; add the recipe by hand instead.

- **Native app:** fetches directly from the phone.
- **Web URL import:** uses the authenticated Supabase Edge Function below because recipe sites generally block cross-origin browser fetches (CORS). The initial server allowlist supports `simplyrecipes.com` and `www.simplyrecipes.com` over HTTPS only; every redirect is checked against that list. New sites must be explicitly reviewed and added in `supabase/functions/import-recipe/handler.ts`.
- **Saved HTML fallback (web):** open the recipe in your browser, use **Save Page As** to save the full page as HTML, enter its original URL in Buko, and choose the `.html` file. Files are parsed locally, never executed or uploaded, with a 3 MB limit. PDFs, screenshots and Reader-mode exports are not supported. This works without deploying a backend.

After saving, the recipe detail page opens. Use **Recipes** in the top-right header or **Back to recipes** at the bottom to return to the recipe list. The header shortcut also appears during import and editing and works even when there is no back history.

Some publishers, including Simply Recipes, may block server fetches with HTTP 403 even when their pages open in a browser. The importer reports that block and offers saved HTML; it does not bypass site protections.

### Deploy the web recipe importer
The web app deployment does **not** deploy Supabase functions. A Supabase project owner must do this once:

1. Install/use the [Supabase CLI](https://supabase.com/docs/guides/cli) and authenticate with `supabase login` on your own computer. Do not put the access token in the app or Git.
2. Find your project reference in Supabase **Project Settings → General**.
3. From the repository root, run:
   ```bash
   supabase functions deploy import-recipe --project-ref YOUR_PROJECT_REF --no-verify-jwt
   ```
   The entry point is `supabase/functions/import-recipe/index.ts`; deploy it together with `handler.ts`. `--no-verify-jwt` disables only the gateway's legacy JWT check: the function itself **requires a valid signed-in user** and verifies the bearer token with Supabase Auth before fetching any page. No service-role key is used.
4. Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to deployed functions automatically. No additional app secrets or web rebuild are needed.
5. Test **Recipes → Import link** while signed in. An undeployed function produces a setup message; a publisher block produces a saved-page suggestion.

The function accepts POST requests only, validates destinations and redirects against its fixed allowlist, limits requests to 4 KB and fetched HTML to 3 MB, and times out remote fetches. It forwards no Buko user credentials to recipe publishers. TypeScript checks cover the shared function handler; the Deno-specific entry point can be checked with `deno check supabase/functions/import-recipe/index.ts`.

## Privacy
No analytics, advertising or tracking SDKs. Health data from Apple Health or Health Connect is only used when you turn a feature on, is never used for advertising and is never shared with third parties. Your data lives in your Supabase project. The only other network calls are food lookups to Open Food Facts and USDA FoodData Central, and the recipe page you ask to import. Web recipe URL requests go through your Supabase function; saved HTML imports stay on your device until you save the parsed recipe to your account.

## Data attribution
Product data is from [Open Food Facts](https://world.openfoodfacts.org) (Open Database License) and is credited in the app. Whole-food data is from [USDA FoodData Central](https://fdc.nal.usda.gov).

## Notes
- The health score and calorie targets are estimates, not medical advice.
- `.npmrc` sets `legacy-peer-deps` because of a React peer-dependency mismatch in the current Expo SDK.
