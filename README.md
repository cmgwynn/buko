# Buko

Scan products, rate them, track what you eat. See [PROJECT.md](./PROJECT.md) for the vision, phase plan and decisions log.

Preparing an iOS/Android beta or store release? Start with the [store listing, EAS beta setup and launch checklist](./docs/STORE-LAUNCH.md). It records app IDs, listing text, account/health declarations and independent device/store acceptance work.

Phases 1-9 are published on web, including subscriptions, owner-verified account export/deletion, dedicated workout mode, recipe-quality workflows, micronutrients and personalized weekly plans. Phase 9 was published from commit `94cbc1a` on 2026-10-29. The connected backend responds to schema checks for the Phase 9 fields/table; Supabase CLI migration history is not recorded for this project, so do not rerun or bulk-push migrations based on CLI status alone. Independent signed-device, real store billing and screen-reader acceptance remain separate from automated checks; native features require a new app build.

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
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql), and run it. Then do the same, each as a **new query**, with [`0002_recipes_planning.sql`](./supabase/migrations/0002_recipes_planning.sql), [`0003_fitness.sql`](./supabase/migrations/0003_fitness.sql), [`0004_profile_birthdays.sql`](./supabase/migrations/0004_profile_birthdays.sql), [`0005_coach.sql`](./supabase/migrations/0005_coach.sql), [`0006_subscriptions.sql`](./supabase/migrations/0006_subscriptions.sql), [`0007_account.sql`](./supabase/migrations/0007_account.sql), [`0008_diagnostics.sql`](./supabase/migrations/0008_diagnostics.sql), [`0009_community.sql`](./supabase/migrations/0009_community.sql), [`0010_ux_workflows.sql`](./supabase/migrations/0010_ux_workflows.sql), [`0011_recipe_profiles.sql`](./supabase/migrations/0011_recipe_profiles.sql), [`0012_diary_navigation.sql`](./supabase/migrations/0012_diary_navigation.sql), [`0013_workout_mode.sql`](./supabase/migrations/0013_workout_mode.sql), [`0014_recipe_quality.sql`](./supabase/migrations/0014_recipe_quality.sql), [`0015_nutrition_insights.sql`](./supabase/migrations/0015_nutrition_insights.sql), and [`0016_planning_preferences.sql`](./supabase/migrations/0016_planning_preferences.sql). This creates private app data and the separate members-only Shared library. For an existing database, run only migrations not yet applied; `0004` and `0005` are safe to rerun. Apply `0009` through `0016` once each; do not paste them again after success. Follow the setup notes below for migrations that need additional configuration.
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
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Public RevenueCat SDK keys; leave empty unless the owner enables store billing |
| `EXPO_PUBLIC_PREMIUM_ENFORCEMENT` | Keep `false` until verified billing and server rollout are approved |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` | Owner-hosted document URLs; currently empty placeholders |

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

Open the URL shown by Expo. The same Supabase and USDA environment variables are used on web; add them to `.env` before starting. **Mobile-web camera scanning now works on HTTPS** (including the published GitHub Pages site): sign in, open **Scan**, start the camera and allow permission. EAN-13, EAN-8, UPC-A and UPC-E decode locally; camera images are not uploaded. Manual barcode entry remains available if permission or camera support is unavailable. An ordinary `http://192.168...` development URL is not a secure camera origin; use the HTTPS site on your phone. Apple Health / Health Connect still require the mobile app.

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
Buko shares an iOS-inspired visual system across native and web: rounded surfaces, clear focus states, and a highlighted active tab. The palette is "Sage Minimal" (based on the Coolors sage palette `dad7cd · a3b18a · 588157 · 3a5a40 · 344e41`, with shades tuned for WCAG AA contrast): sage actions, warm off-white backgrounds, white cards, gray-green secondary text and deep sage hero surfaces. The coconut logo keeps its own brand colors. Health-score and macro colors retain their distinct meanings. A sport-app layer borrows the general modern feel of training apps without new brand colors: deep sage "hero" cards (Diary calories, Train weekly totals) with off-white text, oversized tabular numerals, uppercase eyebrow labels, a pale sage accent, pill buttons, dark selected chips, a dark tab bar, and color-coded left edges on routine and generated-session cards (run, strength, rest). Buttons, chips, profile actions, and recipe cards use subtle Reanimated spring feedback; macro bars animate changes and tabs fade between screens. Motion respects the device/browser reduced-motion preference. There are no separate web-only Tailwind or Motion dependencies.

### Starter libraries and routines
- **Recipes → Buko library:** 210 original Buko recipes across breakfast, lunch, dinner and snacks, with combined meal/cuisine filters, ingredient search and 12-at-a-time browsing. Ten cuisine collections plus **Everyday** for general combinations without a cultural claim. Collections need not contain every meal type: empty combinations are explained rather than padded with mislabeled dishes. Previews link cooking references, explain meaningful adaptations, and link each ingredient's USDA source. These are original formulations, not copied recipes, endorsed reproductions, kitchen-tested recipes or a certification of cultural authenticity.
- Every unmodified library recipe scores at least 75 (Excellent) on Buko's existing 100-point algorithm. Tests verify the threshold, all eight nutrients, no excluded ingredients, independent copies and no duplicated ingredient combinations. The 89 bundled USDA SR Legacy snapshots were retrieved 2026-10-24. Nutrition uses input weights, not measured cooked yield; brands, substitutions and edits change it. Processing/additives are unknown and excluded. Check allergies and cooked/dry ingredient states; advance grain/bean preparation and chilling are additional. **Save a copy** opens an editable matched draft; **Save recipe** creates a private copy. Older private copies are not rewritten. Recipe content saving now requires migration `0010`.
- **Train → Browse workout library:** six starter sessions covering bodyweight, dumbbells, gym and gentle cardio. **Customize** opens the routine editor; **Save routine** adds an independent template without logging a workout.
- **Train → Create routine**, or **Edit** on a saved routine: rename, add/remove/reorder exercises and change sets, reps, weight, time and cardio distance. Targets use your preferred units and are per set. Changes affect future sessions only, not logged workouts or a session already in progress.
- **Delete workout** now uses an in-app confirmation on web and native, with Cancel and explicit error feedback. Saved routines are retained. Deleting an imported workout does not delete its original health-app record, which may import again on a later sync.

These features use the existing fitness migration; no new backend deployment is required. Routine edits use several database requests. If an edit fails partway through, the app explicitly requires a reload before retrying; a failed newly created routine is cleaned up where possible.

The temporary coconut mark is original artwork in [`assets/coconut.svg`](./assets/coconut.svg), with a matching native SVG component and generated app/favicon assets. It appears on authentication screens and tab headers. Native app icon changes require rebuilding the app; web branding updates with the next page load.

### Daily flows and recoverable work
- **Diary:** compact daily summary with expandable macros, prominent Add food, meal-specific Search/Scan/Recipes/Recent choices, editable quantities/meals, multi-add recent foods and confirmed copying from yesterday. Copying skips matching portions already logged, rather than silently doubling the meal. Web/native removal uses the same accessible dialog; Diary, Plan and Groceries offer removal Undo.
- **Food search:** visible Search/Clear controls and source filters. Packaged-food lookups still require submission to respect provider limits; stale searches cannot replace newer results. Unknown barcodes offer scan retry, name search and manual nutrition entry. All four macro values must be known before logging; explicitly entered zero is valid, unknown is not zero.
- **Recipes:** My recipes / Buko library / Shared navigation, saved search and sort, compact library filter sheets, favorites and recently cooked. Favorites/history are account-scoped on this device, not cross-device sync. Cooking completion or Mark cooked updates history. Nutrition scores are distinct from member stars; partial recipe nutrition never receives a confident numeric score. URL import and paste text are separate modes.
- **Plan:** choose a day/meal, search saved, Buko or Shared recipes, confirm servings and add directly. Choosing an unsaved recipe explicitly saves a private copy. Copy the previous day's meal, copy a day to tomorrow, or repeat a week without carrying over logged status. Copies append rather than replace meals. The labeled Groceries action opens the list; generation lets users choose days/meals before replacing only that week's unchecked generated items.
- **Local recovery:** recipe drafts and setup answers expire after seven days; active workouts expire 24 hours after starting. Recovery waits for authentication, shows device-save/recovery/errors, and is cleared on discard, sign-out or account deletion. These are unencrypted device-local snapshots, not server backups. Clear site/app data on a shared device. Completed saves use terminal recovery records; a crash during submission can sacrifice unfinished recovery rather than resurrect a completed action.
- **Offline groceries:** opt in under Groceries → Offline access on this device. This keeps the list for up to seven days and queues checkmarks, with a visible pending count and Retry. Sync runs on focus and web reconnection, preserves failed changes and coalesces repeated checks. Adding, deleting and generation need a connection. The web app shell is not installed as an offline PWA: reopening/reloading the site can still require a connection. Sign-out/deletion clears the cache and queued changes.
- **Profile and Train:** grouped account/privacy/connection links replace repeated large navigation buttons. Train prioritizes Start/Resume and routines; progress and exercise tools remain available. Onboarding keeps its safety gate, explains the estimated two-minute setup and restores entered answers without inventing personal targets.
- Score numbers use dark text independent of band colors; shared controls have keyboard focus outlines, live error/status announcements and labeled actions. This is not a full accessibility certification or a substitute for real-device/screen-reader testing.

### Birthday-based age and automation
Before deploying the birthday UI to an existing installation, run [`0004_profile_birthdays.sql`](./supabase/migrations/0004_profile_birthdays.sql) in **Supabase → SQL Editor → New query**. It adds a private, nullable `profiles.birth_date`, keeps existing data and owner-only RLS, and refreshes the API schema. The birthday migration is safe to rerun: it keeps an existing birthday column and named validation constraint instead of recreating them. If an older copy reports `constraint "profiles_birth_date_valid" already exists`, rerun the complete updated file in a new query. No birthday is inferred for existing users. The old app continues working after the migration.

Onboarding and **Profile → Update details & recalculate** ask for month, day and year instead of age. The app requires a valid birthday for ages 18–100 when saving the form. Existing users retain their stored targets and approximate age until they choose to enter their actual birthday.

For profiles with a birthday, completed age and formula-based calorie/macro targets update on the device at local midnight and when the app resumes. A Feb 29 birthday advances March 1 in non-leap years. Profile and activity-adjusted diary targets share the same age calculation. Birthday target changes are derived on-device, not background database jobs: they do not rewrite food logs, saved targets, goals or preferences. If migration `0004` has not been applied, birthday saves show a setup error instead of silently dropping the date.

**Profile** now opens a useful overview: targets, personal details, Coach, measurements, progress and activity settings. **Edit goals & personal details** opens a single scrollable form; new-account onboarding remains guided. **Settings → Privacy & account → Export data or delete account** provides JSON export and permanent account deletion. Export v2 embeds original private recipe photos as base64 bytes; oversized or invalid exports fail rather than returning a partial file. The public `/delete-account` web page and in-app deletion path require owner authentication and explicit confirmation. Deleting a Buko account does not cancel any store subscription or remove originals from Apple Health/Health Connect.

## Phase 4: optional wellness coach
Open **Diary → Coach & weekly review** or **Profile → Coach, weekly review & preferences**.

- **Weekly review:** previous completed Monday-Sunday intake/target coverage, current product-score averages, Buko workouts and optional smoothed weight trend. Factual summaries need no AI API key. Incomplete logs are not treated as zero intake. Mark food logging complete in Diary only when all meals/snacks/drinks are entered; active-target snapshots are collected on consented Diary visits, not reconstructed.
- **AI chat/check-ins:** when separately activated, Anthropic explains supplied facts and provides three weekly habit suggestions. Code calculates numeric facts; validated model prose cannot prescribe numeric calorie/weight-loss targets. Missing data and uncertain causes stay explicit.
- **Confirmed actions:** add an eligible saved recipe to a chosen date/meal/serving count or add a better-scoring public product alternative to groceries. Nothing is added without confirmation or logged as eaten. Retrying an action does not duplicate it. Food actions pause for support mode/revoked consent/dietary restrictions and reject changed recipes or suggestions older than 14 days.
- **Limits:** recipe candidates need complete calorie/protein ingredient matches. High-protein means at least 20 g/serving; an "under 600" candidate must display fewer than 600 kcal. Recipes are not meal-type classified: choose whether each idea suits dinner. No fabricated recipes/nutrition or allergen-safety claims. Restrictive dietary preferences currently withhold automatic food actions.
- **Privacy/safety:** explicit consent, weight off by default, focus preferences, consent withdrawal and clear-history controls. General wellness information, not medical advice. Medical questions route to professionals; disordered-eating cues pause numeric feedback/actions and share the National Alliance for Eating Disorders helpline. Heuristic detection is not comprehensive and cannot replace professional support.
- **No autonomous goal changes:** this release never adjusts calorie/macro targets.

### Supabase Free setup - live AI stays off
The owner has confirmed the current Coach migration and Edge Functions are working. Publishing the website does **not** deploy a database migration or Edge Function to a separate Supabase project; use the steps below only when setting up another project. Live AI remains deliberately off, and factual summaries do not need an Anthropic API key.

1. Open your existing Supabase project, choose **SQL Editor → New query**, paste the entire [`0005_coach.sql`](./supabase/migrations/0005_coach.sql), then **Run**. Previous migrations must already be applied. This migration preserves existing meals/workouts and is safe to rerun.
2. On your computer, open this repository in VS Code and choose **Terminal → New Terminal**. Run:
   ```bash
   npx supabase login
   ```
   Follow the browser login instructions. The CLI is a deployment tool, not a paid subscription. Do not paste login tokens or database passwords into chat.
3. In Supabase **Project Settings → General**, copy **Project ID / Reference ID**. Replace `YOUR_PROJECT_REF` in each command below with that value (not the project name or full URL):
   ```bash
   npx supabase secrets set COACH_AI_ENABLED=false COACH_GLOBAL_DAILY_REQUESTS=100 --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy coach --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
   npx supabase functions deploy import-recipe --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
   ```
   `--use-api` bundles remotely without Docker. Both functions validate the user's bearer token with Supabase Auth themselves; `--no-verify-jwt` disables only the legacy gateway check, not that authentication.
4. Open https://cmgwynn.github.io/buko/ on your phone and refresh. Open Coach, review/accept optional consent, then **Review my logged week (no AI)**. Empty weeks display missing-data limitations, not invented advice. Chat/suggestion buttons intentionally remain unavailable while live AI is off.
5. Test **Recipes → Import link** with a supported URL, or create a paste-text draft if the publisher blocks fetching.

No Anthropic key is needed for these steps, and they make no paid model calls. Supabase Free has usage/resource limits and may pause inactive projects; staying within its allowance is not unlimited hosting. Do not upgrade or enable paid services just to trial these features.

## Phase 8: recipe quality (release setup)

This release does not automatically certify the existing 210 library recipes.
The approved collection starts empty until an admin records actual cooking tests.
Existing private, imported and Shared recipes continue to work normally.

1. After migrations through `0013`, run
   [`0014_recipe_quality.sql`](./supabase/migrations/0014_recipe_quality.sql)
   **once** in Supabase SQL Editor. Do not rerun it after success.
2. Grant your own signed-in account recipe-admin access in SQL Editor, replacing
   the email with the account you actually use:
   ```sql
   insert into public.recipe_admins (user_id)
   select id from auth.users where lower(email) = lower('YOUR_SIGN_IN_EMAIL')
   on conflict (user_id) do nothing;
   ```
   Confirm exactly the intended account was granted access. App users cannot
   grant themselves this role; Shared-recipe moderator status is separate.
3. Deploy the new authenticated function, with paid AI explicitly off:
   ```sh
   npx supabase secrets set RECIPE_AI_ENABLED=false --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy recipe-quality --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
   ```
   The function verifies bearer tokens itself. Publishing GitHub Pages does
   not run migrations or deploy Supabase functions.
4. After the frontend release, open **Profile → Admin: Recipe quality**.
   Create a normal private recipe with measured/matched ingredients, select
   it for curation, add cuisine, source/permission notes and permitted swaps,
   then save a draft. Cook it, record the test/rating and approve the version.
   Never record a test you have not actually performed.
5. Open **Recipes → Find a tested meal**. With AI off, a compatible unchanged
   approved recipe can be saved without a model call. No compatible approved
   recipe means an explicit unavailable result, never an invented meal.
6. Finish cooking to leave optional private taste feedback. Explicit preferences
   and recipe-specific AI consent live at **Profile → Taste preferences**.

AI adaptation is separately opt-in and metered. Do not enable it just to test
curation. Later, with an owner-funded API budget, set server-only
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and `RECIPE_AI_ENABLED=true`, then redeploy
the function and accept the recipe-specific consent in the app. Coach consent
does not substitute for recipe-sharing consent. Never put private keys into
`EXPO_PUBLIC_*`, source control or chat.

Adaptations are limited changes to a compatible approved base, with rule checks
and a separate chef review. There is one regeneration attempt, then an explicit
unchanged-base fallback. A reviewer is not a physical taste test or an allergy
certification. Nutrition is recalculated from trusted ingredient data.
Tested/Adapted labels use server-verified provenance; changing the formulation
does not retain an unchanged Tested claim. Admins can pause a poorly rated base
without deleting members' saved copies.

Recipe AI reserves each paid adaptation/review separately: **5 calls/minute and
20 calls/UTC day per user**, plus `RECIPE_AI_GLOBAL_DAILY_REQUESTS` across the
project (default 100, range 1–10000). A suggestion can use up to two adaptation
calls and two reviewer calls; each has a 25-second timeout. These are call
limits, not dollar caps. Set provider spending limits separately; failed calls
can consume tokens/reservations. Never promise that an AI-approved meal has been
physically tasted. No paid calls run automatically after cooking feedback.

## Phase 9: personalized nutrition and weekly plans

These features are published on the web version. No paid AI service is used.

- Micronutrient tracking adds optional calcium, iron, potassium, vitamin C and
  vitamin D data from USDA/Open Food Facts or manual labels. Unknown source
  values remain unknown rather than being treated as zero. Daily Value
  percentages use the [FDA Daily Values](https://www.fda.gov/food/nutrition-facts-label/daily-value-and-percent-daily-value-nutrition-and-supplement-facts-labels)
  for adults and children 4+.
- Weekly nutrition insights average only days with logged food and show the
  number of days represented. Calorie-target suggestions require at least 14
  logged days in the last 21 and four weight readings spanning at least 14 days.
  Suggestions are limited to 100 kcal per review and ±200 kcal total; the
  existing calorie floor is preserved. Nothing changes until the user accepts.
- Generate a seven-day meal plan from saved recipes and the Buko library using
  current targets, intake, diet preferences and reusable account-level food
  exclusions. Preview additions and estimates before saving. Only explicitly
  selected existing slots may be replaced; logged meals are protected. Start
  from the **Plan my week** card at the top of Plan: pick days (defaults to
  today onward), meals and foods to skip (saved automatically when you
  preview), then review a day-by-day preview before **Add to my plan**. Tap ⇄
  on any previewed meal to swap only that meal (other slots, targets and
  exclusions are kept). An empty Diary day today or later offers **Generate
  my week**, which opens Plan with the generator expanded (`/plan?generate=1`).
  Diary keeps food-history search behind the header search icon.
- Generate a four-week general-fitness run/walk and optional light-strength
  schedule from the user's comfortable run duration, frequency and preferred
  weekdays. Running time increases by at most 5% in each of weeks 2 and 3, then
  week 4 is a recovery week. Review and edit every week before saving; existing
  workouts are preserved unless the user selects a specific uncompleted slot
  for replacement. Open it from **Build my training plan** on Train (or from
  Start workout); it has its own screen at `/workout/plan`. Per-workout edits
  sit under each session's **Adjust** section. Once a week has planned
  workouts, Train shows a week strip (run/strength dots, check marks when
  done); tap a day to jump to it or **Edit plan** to regenerate.
- Saved food and exercise exclusions are account-scoped and reusable. These
  plans are estimates and not medical advice. Ingredient phrase matching is
  conservative, and recipes are not guaranteed kitchen-tested, allergy-safe or
  compatible with every dietary need; inspect ingredients and labels.

Migrations [`0015_nutrition_insights.sql`](./supabase/migrations/0015_nutrition_insights.sql) and [`0016_planning_preferences.sql`](./supabase/migrations/0016_planning_preferences.sql) define the required optional nutrient snapshots, accepted-adjustment storage and owner-only planning exclusions. The connected project's REST schema checks confirmed the required fields/table are present. Its Supabase CLI migration history is blank, so do not blindly rerun migrations or run a bulk `db push`; reconcile migration history with the project owner before future schema changes. GitHub Pages does not apply SQL.

## Beta trial readiness (free core, Buko Plus, feedback)

- **Free core, paid personalization:** logging, scanning, manual meal planning, "Add to plan" on recipes, recipe import and grocery lists are free. Anyone can preview the meal and training plan generators. Saving a generated plan, AI tested-meal suggestions, Coach and health-app sync need Buko Plus (the `premium` entitlement). Targets are $49.99/yr with a 7-day free trial or $9.99/mo. The paywall defaults to Yearly. All of this stays unlocked until premium enforcement is turned on.
- **Welcome:** after setup, Diary shows a one-time **Welcome to Buko** card with three starting points: Plan my week, Build my training plan, and Scan my first food.
- **Feedback:** Profile → **Send feedback** saves the category, message, screen, platform and app version to `feedback`. If the table is missing, it falls back to `EXPO_PUBLIC_CONTACT_EMAIL`.
- **Anonymous usage counts:** once per account per day, the app calls `record_daily_use`, which increments `usage_daily` by date, platform and sign-up week. No user ID is stored. Users can turn this off in Settings.
- **Grocery ordering:** when `EXPO_PUBLIC_GROCERY_ORDERING=true`, Groceries shows **Order on Instacart**. The `grocery-order` function (with secrets `INSTACART_API_KEY`, `INSTACART_BASE_URL` and `GROCERY_ORDERING_ENABLED`) turns unchecked items into an Instacart shopping-list link. Only names, quantity notes and UPCs are sent. Setup is in STORE-LAUNCH.
- **No ads:** Buko has no ad SDKs or ad slots.
- **Legal drafts:** `public/legal/privacy.html` and `terms.html` are served at `/buko/legal/...`.
- Apply [`0017_trial_readiness.sql`](./supabase/migrations/0017_trial_readiness.sql) in the SQL editor (not `db push`), and redeploy `import-recipe`. The beta checklist is in [docs/STORE-LAUNCH.md](./docs/STORE-LAUNCH.md#beta-trial-plan-closed-testing).

## Coach: later activation of Anthropic (optional, metered)
Only do this after deciding to fund API usage. A free Claude chat account is not free Anthropic API credit.

1. In your Anthropic console, configure available spending/usage limits and choose a supported model ID.
2. In **Supabase → Edge Functions → Secrets**, add `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` using the console values; set `COACH_AI_ENABLED=true`. Never put these or the Supabase service-role key in `.env`, `EXPO_PUBLIC_*`, Git or chat.
3. Redeploy `coach` with the command above, then verify status while signed in. To stop future model calls, set `COACH_AI_ENABLED=false` and redeploy.

Server limits are **5 requests/minute and 30/UTC day per user**, plus `COACH_GLOBAL_DAILY_REQUESTS` reservations across the project (default 100). Factual summary requests consume reservations too; cached weekly AI replies and safety referrals make no model request. There are no scheduled/background model calls. The global limit is a request count, **not a dollar cap**; provider spending limits are separate. Failed requests can still consume reservations/provider tokens.

Chat sends minimized summaries, goals/preferences, eligible food candidates and up to four recent chat exchanges to Anthropic. Structured context excludes names, email, account IDs and birthdays. Free-text redaction cannot catch every identifier; avoid personal information in messages/recipe titles. Anthropic API retention/processing terms apply. Imported Apple Health/Health Connect workouts and active energy are excluded; weight summaries require separate opt-in. Clearing history deletes Coach replies/action cards, not already-added plan/grocery items or cost-control counters.

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
- `npm test` - both the existing Node logic/PostgreSQL tests and Jest/React Native component tests
- `npm run test:unit` - Node logic and PostgreSQL authorization/transaction tests
- `npm run test:components` - Jest/React Native Testing Library tests
- `npm run verify` - both test runners followed by TypeScript

See [TESTING.md](./TESTING.md) for focused commands and test conventions. Run the tests before reporting any phase complete.

## Phase 6: dates and diary shortcuts
- Verification: 289 Node tests and 43 Jest tests pass, plus TypeScript and production web/iOS/Android JavaScript exports. Browser visual checks, native gesture/screen-reader acceptance and live migration application are not implied by these results.
- Diary, Plan and Train share one account-scoped selected date. Diary/Plan show a Monday-start week strip, day arrows and a month/year calendar picker. Swipe the strip to change weeks and main content to change days; buttons provide keyboard/screen-reader alternatives. Today returns to the current local day. Browsing history does not backdate a live workout.
- Calendar dots mark dates with logged food or workouts (not planned meals). Queries cover the visible calendar range only. Shared dates use local calendar arithmetic rather than UTC day slicing.
- Diary offers confirmed duplicate-aware copying of yesterday's meals and whole days. Long press a food, or open its labeled actions, to favorite, move or copy it to a different meal/date. Copies retain nutrition/portion snapshots, append rather than replace and do not copy health-app links. Retrying the same transfer request cannot create another batch.
- Food favorites sync across devices, separately from device-local recipe favorites. Find them beside Recent in food search. Diary history search searches only your own saved food names/brands, literally (including `%` and `_`), newest date first, with pagination, View day and Log again.
- **Before deploying Phase 6:** run [0012_diary_navigation.sql](./supabase/migrations/0012_diary_navigation.sql) once in Supabase SQL Editor after migrations through `0011`. It adds owner-only food favorites, transfer receipts, atomic move/copy operations and bounded history search. Favorites/receipts cascade with account deletion; favorites are included by account export's user-table discovery. SQL tabs may be closed after success. No Edge Function redeployment is needed for this migration. A failed migration must be resolved before deploying; GitHub Pages never applies SQL.

## Phase 7: focused workout mode
- Train → **Start workout** opens a saved routine or an empty workout. Planned workouts store a routine snapshot. The active workout has no tab bar: complete sets with Done, review the suggested last-session values, and use Exercises to jump or add movements.
- Rest starts after completed sets (or superset rounds). Adjust by 15 seconds, skip rest, or choose an exercise's rest default. Enable rest alerts explicitly; permissions, silent mode and OS background restrictions still apply.
- Swap exercises for matching primary muscles, pair the current and next exercise as a superset, add notes and optional set RPE, and review duration/working-set volume/PRs before finishing.
- Start online at least once to cache your own routines, exercises, profile and history. After that, workouts can start, autosave, resume and finish offline. A finished session is saved on device before syncing. Keep the local copy until sync is confirmed; clearing site/app storage removes unsynced data.
- The production website caches its static workout shell after a successful online visit; private API responses are not cached by its service worker. Native Live Activities and health exports require a development/production app build, not a browser.
- Migration `0013_workout_mode.sql` must be applied after `0012` before publishing Phase 7. The migration is not applied by GitHub Pages. Native widget/notification/audio setup requires a new app binary; JavaScript updates alone cannot add the extension.
- Follow [native workout setup](./docs/WORKOUT-NATIVE.md) for iOS Live Activities, alert permissions, development builds and signed-device checks. Expo Go cannot host Buko's widget extension.

## Tuning the health score
All weights, thresholds, flagged additives and source citations live in [`src/lib/scoring/config.ts`](./src/lib/scoring/config.ts). Each factor's logic is in `factors.ts`. Change a number, run `npm test`, and the app picks it up. Scores are never stored, so there is nothing to migrate.

## Recipe import
Paste a recipe link and Buko reads its structured schema.org Recipe data (ingredients, steps, servings, times). The source URL is saved and shown. Always review imports, ingredient matching, nutrition and attribution before saving.

- **URL import (web and native):** authenticated Supabase Edge Function, HTTPS only. Supported domains: Simply Recipes, Allrecipes, BBC Good Food, Budget Bytes and Spend With Pennies, including each domain's `www` form. Every redirect is checked; credentials and nonstandard ports are rejected. Additional domains need explicit allowlist review.
- **Phone-friendly fallback:** copy ingredients/instructions from a page you can access, open Buko's import screen, enter a title, paste ingredients (one per line) and instructions (paragraphs separated by blank lines), then tap **Create editable draft**. Optional source URL/attribution are retained. Servings may be 1-100; blank defaults to four and is flagged for review. No HTML download, backend or AI is needed. Fields are limited to 100,000 characters.
- **Advanced saved HTML (web):** optional **Advanced: import a saved HTML page** retains the local 3 MB `.html` parser. Files are never executed/uploaded; PDFs, screenshots and Reader-mode exports are unsupported. This is not required on iPhone.

After saving, the recipe detail page opens. The upper-left back arrow retraces in-app history; if a recipe page was opened directly with no stack history, it returns to Recipes. Workout pages similarly fall back to Train. Other detail screens have a consistent upper-left back control and centered title. Grocery is a hidden tab, so its arrow returns explicitly to Plan rather than invoking tab-back behavior that could jump to Diary. Sign-up returns to sign-in. Tab roots retain the tab bar instead of adding a misleading back action. The old top-right Recipes/Train shortcuts are removed. Score badges show only the number; the 100-point scale remains in explanations and screen-reader labels.

### Research informing recipes and navigation

Cuisine references are bundled in [`libraryReferences.ts`](./src/lib/recipes/libraryReferences.ts) and shown in recipe previews. They include [Panlasang Pinoy on adobo](https://panlasangpinoy.com/filipino-chicken-adobo-recipe/), [Hot Thai Kitchen on laab and toasted rice](https://hot-thai-kitchen.com/laab-gai/), [Just One Cookbook on goma-ae](https://www.justonecookbook.com/spinach-with-sesame-sauce/), [Mexico in My Kitchen on a la mexicana](https://www.mexicoinmykitchen.com/nopales-easy-mexican-recipe/), [GialloZafferano on pasta e ceci](https://ricette.giallozafferano.it/Pasta-e-ceci.html), [The Mediterranean Dish on parsley-led tabbouleh](https://www.themediterraneandish.com/tabouli-salad/), and indexed references from Swasthi and The Woks of Life (their pages blocked direct retrieval). Dish identities, not their prose or exact formulations, inform Buko's original recipes. Brown rice, lean meats, simplified spice lists and vinegar substitutions are disclosed; generic tropical-fruit bowls and peanut dips have moved to Everyday. Regional categories are browsing aids, not claims to represent entire cultures. Recipe tasting and culturally knowledgeable editorial review remain release-quality work.

Navigation follows [Apple's toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars) on standard Back symbols and separating navigation from actions, [Material app bars](https://m3.material.io/components/app-bars/guidelines) on leading navigation controls, and [WCAG consistent navigation](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html). The shared control has a 48-by-48 target, an accessible Back label, and an in-app deep-link fallback. Centered detail titles are a deliberate cross-platform Buko choice; native back gestures remain available where previously enabled.

### Shared recipes (backend setup required)

**Recipes → Shared** is a separate, signed-in-members-only library. Visible labels use “Shared recipes,” “Ratings & reviews” and “Recipe variations,” not “community.” Technical route/table/function identifiers retain that internal name. The owner approved immediate publication (not pre-approval), all nutrition score bands with a green-only filter, 1–5-star member ratings, written cooking/modification notes, and author-declared dietary tags. The 210 curated originals remain a separate collection; no private recipe is automatically published.

- Browse with combined meal, cuisine, dietary tags and literal title/description/ingredient search; 12 recipes per page. Top rated uses `(sum of stars + 5 × 3.5) / (review count + 5)` rather than letting one five-star review outrank consistently reviewed recipes. Actual average and review count are shown separately; unrated recipes say so.
- Publishing requires a saved private recipe, a description and explicit sharing/ownership permission. The authenticated `community` Edge Function fetches the owner's saved ingredients, strips private IDs/photos/source URLs and computes a fixed snapshot using the existing Buko algorithm. Client-provided scores/payloads/author IDs are ignored. Every ingredient needs a positive gram weight and all eight finite nutrient fields for a score; incomplete recipes can be shared but get **no numeric score**. Data is contributor-supplied, not independently verified. All score bands are allowed.
- A shared snapshot is immutable. Private edits do not change other members' recipes or invalidate existing reviews. **Save or modify a private copy → Save recipe → Share my variation** creates a separately scored publication linked to its parent. Use the saved private copy with cooking, groceries and the meal planner. Withdrawal hides the snapshot; saving a different private copy is required for a new publication. Other members' existing private copies remain.
- One editable rating/review per member per recipe; authors cannot rate their own recipe. Latest 50 visible reviews and 20 variations appear in a detail page. Report buttons cover recipes/reviews; blocking hides contributions and reviews in both directions and recalculates the visible rating aggregate. Unblocking is available in the library. These are not verified-purchase or verified-cooking ratings.
- Optional public pseudonyms are chosen explicitly, never filled from auth names or email. Names are 3–30 letters, numbers, periods, underscores or hyphens, unique without regard to case; reserved staff-like names are rejected. Lookup requires sign-in and visible contributions; bilateral blocks apply. Names are included in account export and deleted with the account. Variations require a separate **What changed** note. Both features need migration `0011` and the updated publishing function.
- Vegan, Vegetarian, Gluten-free, Dairy-free and Nut-free tags are self-declared. Keyword checks warn of possible contradictions, not certify safety or absence of allergens. Brands, substitutions and cross-contact require human checks. Never use these tags as a medical safety guarantee.
- All community tables use RLS with direct member access revoked. Bounded member RPCs enforce visibility/ownership and server-only publication prevents forged stored scores. Writes have a transactional 100/day/member limit; publication also caps at 10/day/member. There are no paid AI calls. Operator-assigned moderators handle a private report queue, remove contributions or resolve reports with an audit reason. No one can grant themselves moderator rights. Publishing refuses to start if there is no designated moderator.
- Existing account export automatically includes the new `user_id` tables. Deleting an author deletes their shared recipes/reviews/reports/block settings; child reviews on removed recipes are deleted and links in other members' independently saved private copies/variations become null. Private copies already saved by others are not erased. No public real names, email profiles, photo sharing, messages or follower system are introduced.

#### Owner activation steps

Publishing GitHub Pages alone does **not** apply Supabase SQL or deploy its functions. Until setup is complete, Shared errors explicitly explain the missing backend. Browsing the curated collection works without sharing setup, but saving private recipes and generating groceries require migration `0010`.

1. Apply the complete [`0009_community.sql`](./supabase/migrations/0009_community.sql) once in **Supabase → SQL Editor → New query → Run**, after migrations 0001–0008.
2. Apply [`0010_ux_workflows.sql`](./supabase/migrations/0010_ux_workflows.sql) and then [`0011_recipe_profiles.sql`](./supabase/migrations/0011_recipe_profiles.sql), each once in a separate query. `0010` atomically saves private recipe content and replaces generated groceries under the caller's existing owner-only policies. Failed replacements roll back; no old recipe ingredients or unchecked list items are erased on failure. `0011` adds optional public pseudonyms and variation change notes.
3. Designate your moderator in a **new SQL query**. Replace the example email with your own existing Buko account email (do not put that email or any service key in Git/chat):

   ```sql
   insert into public.community_moderators(user_id)
   select id from auth.users where lower(email)=lower('YOUR_EXISTING_ACCOUNT_EMAIL')
   on conflict do nothing;
   select count(*) as moderator_count from public.community_moderators;
   ```

   The count must be at least one; a zero count means no matching account. This does not expose your email to members. To revoke moderator access, an operator deletes that account's row in this table. Check **Shared recipes → Moderation reports** using the designated account.
4. From the repository folder deploy (or redeploy) the function:

   ```bash
   npx supabase login
   npx supabase functions deploy community --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
   ```

   `YOUR_PROJECT_REF` is the ID from **Supabase → Project Settings → General**, not a URL or password. `--no-verify-jwt` only disables the legacy gateway check: the handler independently validates the exact bearer token with Supabase Auth and reads private recipes through owner RLS before using its server-only key to save the snapshot. Supabase supplies the function's server environment; no new provider secret or paid service is needed.
5. Refresh the web app. With two test member accounts, publish an original recipe from one, review/save a variation/report it from the other, and resolve that report from the moderator account. Check filtering, blocking/unblocking, optional names, change notes, withdrawal and the account export/deletion flow. Local database/handler/browser tests are not a claim that this live setup has been completed.

Immediate publication requires active human moderation and a reachable owner/support channel. This foundation does not certify app-store UGC compliance, replace legal review or establish a moderation response-time promise. Review policy/store declarations before any native store launch; no new legal policy documents or store submissions are included.

Some publishers, including Simply Recipes, may block server fetches with HTTP 403 even when their pages open in a browser. Buko reports the block and recommends pasting recipe text; it does not bypass site protections.

### Deploy the recipe importer
The web app deployment does **not** deploy Supabase functions. A Supabase project owner must do this once:

1. Use the [Supabase CLI](https://supabase.com/docs/guides/cli) and authenticate with `npx supabase login` on your own computer. Do not put the access token in the app or Git.
2. Find your project reference in Supabase **Project Settings → General**.
3. From the repository root, run:
   ```bash
   npx supabase functions deploy import-recipe --project-ref YOUR_PROJECT_REF --no-verify-jwt --use-api
   ```
   The entry point is `supabase/functions/import-recipe/index.ts`; deploy it together with `handler.ts`. `--no-verify-jwt` disables only the gateway's legacy JWT check: the function itself **requires a valid signed-in user** and verifies the bearer token with Supabase Auth before fetching any page. No service-role key is used.
4. Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to deployed functions automatically. No additional app secrets or web rebuild are needed.
5. Test **Recipes → Import link** while signed in. An undeployed function produces a setup message; a publisher block recommends paste-text drafts.

The function accepts POST requests only, validates destinations and redirects against its fixed allowlist, limits requests to 4 KB and fetched HTML to 3 MB, and times out remote fetches. It forwards no Buko user credentials to recipe publishers. TypeScript checks cover the shared function handler; the Deno-specific entry point can be checked with `deno check supabase/functions/import-recipe/index.ts`.

## Privacy
No behavioral analytics, advertising or tracking SDKs. The only usage measure is an anonymous daily count (date, platform and sign-up week, with no user ID), which users can turn off in Settings. Feedback is stored only when a user sends it. This does not mean Buko never communicates with third-party services: food lookups use Open Food Facts/USDA; recipe URL requests go through your function to the requested supported publisher without Buko account credentials; and, if purchases are enabled, RevenueCat uses the stable Supabase account UUID as a pseudonymous subscriber identifier (not anonymous data) while Apple/Google process store transactions. Settings has a separate, optional crash-signal control that is off by default. If enabled and configured, it sends only a fixed JavaScript error category, platform and fatal flag through Supabase to the crash service; raw error text/stacks, screenshots, breadcrumbs, health data, chat and user IDs are not forwarded. Native crash dumps and session replay are not enabled. Supabase still receives authenticated requests and can associate account/session information and network metadata with them; the crash service sees the relay connection rather than the device connection. Account data lives in your Supabase project. Browser camera frames and pasted/saved-page drafts stay on the device until parsed recipe data is saved. Health integration is optional, not used for advertising, and imported workouts/active energy are excluded from Coach. Separately opted-in weight summaries and minimized food/goal/chat context can go to Anthropic only after consent and owner activation; see the Coach section for controls and retention limitations.

## Data attribution
Product data is from [Open Food Facts](https://world.openfoodfacts.org) (Open Database License) and is credited in the app. Whole-food data is from [USDA FoodData Central](https://fdc.nal.usda.gov).

## Notes
- The health score and calorie targets are estimates, not medical advice.
- `.npmrc` sets `legacy-peer-deps` because of a React peer-dependency mismatch in the current Expo SDK.
