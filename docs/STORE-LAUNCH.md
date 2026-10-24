# Buko app-store preparation and release guide

**Status (2026-10-24): preparation only; not ready for public store release.** Phases 1–7 are live on web, with backend setup through `0013` owner-confirmed. Phase 8 is built on a feature branch but not deployed: **460 tests**, TypeScript, the recipe-quality Deno graph and web/iOS/Android JavaScript exports pass. Automated checks are not signed-device, store-billing or live-backend acceptance. Browser synthetic checks constructed the account-export Blob/anchor and checked photo/device data, but no actual Playwright download event was emitted; OS file-save behavior remains unverified. No signed binaries have been verified. Migration `0014`, the new function and initial human recipe curation remain release prerequisites. Store assets, declarations and release review remain open. This guide is not a compliance certification or a promise of store approval.

Do not enable a public paid entitlement or publish paid paywalls as part of this preparation. Keep the paid rollout staged off until the native purchase flow, verified entitlement, restore/manage flows, account deletion/export and server-side premium gates pass the tests below.

Successful account deletion now returns the signed-out user to Buko's welcome/sign-in screen with a deletion confirmation. Local-cleanup failures remain visible instead of redirecting away from the recovery instructions. Direct Apple and Google Play cancellation links are available before deletion, after deletion and on Premium, regardless of the current device. Store cancellation still requires the customer's confirmation; deleting a RevenueCat subscriber is not cancellation. Apple does not permit developer-initiated cancellation; Google supports server cancellation but it is not integrated here. Do not advertise automatic subscription cancellation on account deletion.

## App facts to use when preparing a listing

These facts are grounded in the current app and native configuration. Recheck them against the release candidate before submitting:

- App name: **Buko**. Expo version currently `1.0.0`.
- iOS bundle ID: `com.cmgwynn.buko`. Android application ID: `com.cmgwynn.buko`. These identifiers are already in `app.json`; do not change them after creating store records/builds.
- The app supports phones, not iPad (`supportsTablet: false`).
- Features include account-based nutrition onboarding and formula-based targets; locally decoded barcode scanning with product information, explainable 0–100 product scores and alternatives when available; a food diary; original starter and saved recipes; supported-recipe URL import and paste-text fallback; meal planning, pantry and grocery lists; cooking steps/timers; workout routines and progress; and optional settings for Apple Health or Health Connect.
- Native health permissions are optional and user-controlled. The configured Apple Health integration can read steps, active energy and workouts, and can write Buko workouts and diary nutrition when individually enabled. Android declares Health Connect read permissions for steps, active calories and exercise, and write permissions for exercise and nutrition. These capabilities require a native development/release build and device testing; they are not available in the web app.
- **Microphone permission is not an app feature.** Config introspection verifies Android `MainActivity` launch mode `singleTop` and an explicit manifest merger `tools:node="remove"` rule for `RECORD_AUDIO`. This is the configured mitigation; the actual signed build’s merged manifest remains untested. Verify it contains no `RECORD_AUDIO` permission before submission; plugin output is not proof of the final manifest.
- Barcode frames are decoded on-device in the browser scanner; barcode/product lookups use Open Food Facts, while whole-food nutrition lookup uses USDA FoodData Central. A recipe URL import requests the specific URL the user submits through the Buko backend; a publisher may block imports, in which case paste-text import is available.
- Account records and private recipe photos use the configured Supabase project. Optional Coach requests require consent and send minimized context/chat to Anthropic through the server; AI remains off by default. Do not advertise an active AI Coach, AI chat, or AI-generated suggestions in the listing or screenshots until it has been intentionally activated and verified for that release.
- Optional diagnostics are separately consented per account/device in Settings and off by default. If enabled and server-configured, the app sends only a fixed technical category (`render_failure` or `unhandled_js`), platform and fatal flag through Supabase to the crash service. It does not send raw exception messages/stacks, screenshots, breadcrumbs, health values, chat, or user IDs; native crash dumps/session replay are not enabled. Supabase authenticates the request, so it can associate the relay request with the Buko account and observe the device-to-Supabase network metadata/IP. The crash provider receives a report without the Buko user ID and sees the relay connection/IP rather than the device connection. JavaScript diagnostics do not report every native crash.
- Other processors also receive the information needed for their specific function: RevenueCat purchase SDK/server calls use the stable Supabase account UUID as a pseudonymous subscriber identifier (not anonymous data) to verify the `premium` entitlement; Apple/Google process store purchase and account data; Open Food Facts/USDA receive product/barcode or food queries; supported recipe publishers receive the requested recipe URL through the Buko backend; Anthropic receives minimized Coach context/chat only after consent and owner activation. Each service can process its own request/network metadata. Verify exact payloads, provider retention and legal disclosures before completing store privacy declarations; do not make blanket “no third parties,” “anonymous,” or “never shared” claims.
- There is no tested general offline mode. Do not claim that Buko works offline. Network-dependent lookups and account-backed features need connectivity; test failure and recovery behavior before submission.

### Recipe quality and provenance work in progress

Migration `0014` and focused database tests implement recipe classifications and provenance on the Phase 8 feature branch; they are not deployed yet. Recipe metadata includes `cuisine`, `meal_types`, `diet_tags` and nullable `base_recipe_version_id`, `recipe_adaptation_id` and `quality_fingerprint`; existing recipes are not assigned invented provenance. The owner-only `recipe_quality_provenance` RPC compares current content with an immutable adaptation snapshot. Recipe snapshots use camel-case summary fields such as `prepMinutes` while ingredient fields remain snake_case. Quality checks and suggestions are consent/configuration gated. Keep store copy generic until the migration, function and frontend are deployed and accepted; do not claim allergy suitability, cultural authenticity, nutritional certification or physical testing by an AI reviewer.

### Build-time configuration and credential handling

The app reads these four public build-time variables directly from `src/lib/config.ts`:

| Variable | Purpose | Handling |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | Public app configuration |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase public/anon key | Bundled in app; relies on correctly configured RLS |
| `EXPO_PUBLIC_USDA_API_KEY` | USDA FoodData Central lookups | Bundled in app; treat as public |
| `EXPO_PUBLIC_CONTACT_EMAIL` | Contact in Open Food Facts User-Agent | Public contact address |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | RevenueCat iOS SDK public key | Public SDK key; keep the server API key separate |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | RevenueCat Android SDK public key | Public SDK key; keep the server API key separate |
| `EXPO_PUBLIC_PREMIUM_ENFORCEMENT` | Client premium rollout switch | Current staged value `false`; initial client fail-closed rollout flag |
| `EXPO_PUBLIC_PRIVACY_URL` | Hosted privacy document link | Empty placeholder currently; owner must supply a working HTTPS URL |
| `EXPO_PUBLIC_TERMS_URL` | Hosted terms document link | Empty placeholder currently; empty until the owner supplies an approved URL |

`EXPO_PUBLIC_*` values are inlined into the compiled app and are not secrets. Set the correct values in the EAS environment used by the production build, then verify the production profile selects that environment. The current `eas.json` already has a `production` build profile, but its EAS project/environment setup still needs to be verified.

The `account` Edge Function uses Supabase’s server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; Supabase injects these in the Edge Function environment. `REVENUECAT_SECRET_API_KEY` is an optional server secret used only if the owner configures RevenueCat subscriber cleanup. Never copy these server values into the app.

Never put an Anthropic key, Supabase service-role key, RevenueCat secret API key, Apple private key, Google service-account JSON, signing credential or other private credential in `.env.example`, `EXPO_PUBLIC_*`, source control, a screenshot, issue, or chat. Store server-only provider keys as Supabase Edge Function secrets. The currently implemented Coach function uses `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; leave them unset and AI disabled unless the owner separately approves a metered rollout. Store signing and submission credentials only in Apple/Google/EAS credential stores.

Optional diagnostics use `DIAGNOSTICS_ENABLED=false` by default, `SENTRY_DSN` as a private server-side secret, and `DIAGNOSTIC_RELEASE=1.0.0`. Migration `0008_diagnostics.sql` provides a 5-per-minute per-account server quota. The opt-in is stored locally under `buko:diagnostics:<user-id>` and deleted during account cleanup. Do not enable the relay or add the DSN to a client build until the owner confirms provider settings and public disclosures.

## Proposed store listing copy

Draft copy is deliberately limited to currently implemented, user-facing features. Review every statement on the release candidate and remove any feature that is unavailable in a particular platform build. Character counts include spaces and punctuation.

### Apple App Store

**Name — 20/30 characters**

> Buko: Food & Fitness

**Subtitle — 24/30 characters**

> Scan, plan, cook & track

**Keywords — 60/100 characters**

> barcode,nutrition,meal,recipes,grocery,diary,workout,fitness

**Description — draft**

> Buko brings food choices, meal planning and training into one place.
>
> Scan a packaged-food barcode to see an explainable product score, nutrition details and alternatives when product information is available. Add foods to your diary and review calories and macros alongside your personal targets.
>
> Plan meals with your own recipes or start with Buko’s recipe library. Import a supported recipe link or paste recipe text, adjust ingredients and servings, and build a grocery list from your plan. Keep pantry items, cook with step-by-step instructions and timers, then log recipe portions in your diary.
>
> Build and customize workout routines, record sessions, follow progress and review weight trends. On supported iPhone devices, optionally connect Apple Health to read activity or save eligible Buko workouts and diary nutrition after granting the relevant permissions. Connections are optional and can be changed in Buko and device settings.
>
> Buko is a general food, nutrition and fitness tracking tool. Scores and formula-based targets are estimates for general wellness, not diagnoses or medical advice. Product information and nutrition matches can be incomplete; check ingredients, serving sizes and source data for yourself.
>
> Sign-in and cloud-synced features require an internet connection and a Buko account. Product records and recipe-site imports vary by availability. Camera scanning requires permission; manual barcode entry is available when scanning is unavailable.

### Google Play

**Title — 20/30 characters**

> Buko: Food & Fitness

**Short description — 78/80 characters**

> Scan products, plan recipes and groceries, and track food, goals and workouts.

**Full description — draft**

> Buko brings food choices, meal planning and training into one place.
>
> **Scan and learn**
> Scan a packaged-food barcode to see an explainable product score, nutrition details and alternatives when product information is available. Add foods to your diary and review calories and macros alongside your personal targets.
>
> **Plan meals and shop**
> Make meals from your own recipes or Buko’s recipe library. Import a supported recipe link or paste recipe text, adjust ingredients and servings, and build a grocery list from your plan. Keep pantry items, cook with step-by-step instructions and timers, then log recipe portions in your diary.
>
> **Move and review progress**
> Build and customize workout routines, record sessions, follow progress and review weight trends. On supported Android devices, optionally connect Health Connect to read activity or save eligible Buko workouts and diary nutrition after granting the relevant permissions. Connections are optional and can be changed in Buko and device settings.
>
> Buko is a general food, nutrition and fitness tracking tool. Scores and formula-based targets are estimates for general wellness, not diagnoses or medical advice. Product information and nutrition matches can be incomplete; check ingredients, serving sizes and source data for yourself.
>
> Sign-in and cloud-synced features require an internet connection and a Buko account. Product records and recipe-site imports vary by availability. Camera scanning requires permission; manual barcode entry is available when scanning is unavailable.

Do not claim particular foods are available, recipes are medically suitable, nutrition values are exact, or results are guaranteed. Do not imply health-system or medical-professional endorsement. Add Coach copy only after live Coach activation and build-specific testing; its availability is not assumed here. Add pricing/trial copy only after store products, eligibility behavior, local prices and purchase restoration are verified.

## Store screenshots and creative

Capture screenshots from the actual signed release candidate, using safe demo data with no real names, email addresses, health values or account identifiers. Prefer unaltered app captures; any added captions must accurately describe the shown feature and must not conceal or invent app UI.

### Apple App Store

- Current App Store Connect guidance requires at least one iPhone screenshot for an iPhone with Dynamic Island (medium display); it permits up to 10 screenshots per display size. Accepted current portrait sizes for this display class include **1179 × 2556** and **1206 × 2622** pixels. Use a native simulator/device capture at a resolution accepted by App Store Connect and confirm the upload target in the live form.
- Buko is configured not to support iPad, so do not submit iPad screenshots or imply iPad support unless that configuration changes and is tested.
- Use JPEG or PNG without an alpha channel. Check current App Store Connect screenshot specifications at upload time; Apple can change supported device classes and accepted sizes.

### Google Play

- Provide at least **2** screenshots overall (up to 8 per supported device type). For better Play discovery, its current guidance recommends at least **4** app screenshots at 1080 px or larger: portrait **1080 × 1920 or larger at 9:16**, or landscape **1920 × 1080 or larger at 16:9**. All screenshots must be JPEG or 24-bit PNG without alpha, at least 320 px and no more than 3840 px on a dimension; the longest dimension must be no more than twice the shortest. A common 1080 × 2400 phone capture exceeds the 2:1 limit and must not be submitted as-is. Recheck the console’s device-specific upload panel.
- Play also requires a feature graphic (**1024 × 500**, JPEG or 24-bit PNG without alpha) and a 512 × 512 PNG store icon under the current preview-asset rules. Verify the final assets and limits in Play Console; the launcher icon is not automatically a compliant store icon.

### Screenshot shotlist

Use real release-candidate screens for all of these; omit any screen that is not available and tested:

1. **Scan:** permission explanation / scanner and a real decoded product result with a readable score explanation, not a fabricated brand/product.
2. **Diary:** food entries and daily totals compared with a target, using a synthetic demo account.
3. **Recipes:** saved recipe or recipe library, with ingredients, portions and nutrition-match caveat visible where relevant.
4. **Plan and grocery:** planned meals and the resulting grocery list, showing realistic quantities and pantry behavior.
5. **Train:** a routine/session and progress screen based on synthetic workout history.
6. **Connections:** optional Health settings screen with controls off or a neutral permissions explanation; do not show personal records or suggest a connection is mandatory.

Do not show the Coach as live, a premium paywall, a price, a free-trial offer, or a locked premium health/meal screen until that exact functionality is enabled, policy-reviewed and tested in the submitted build.

## EAS build and beta submission (novice path)

This uses Expo Application Services (EAS) to build signed store binaries and upload them to the review/test systems. Uploading a binary does **not** publish a production release. Current configuration defines `development`, `preview` and `production` environments; the `beta` build profile extends `production` with store distribution. The preview profile creates an Android APK for direct installation, while `beta` produces store-ready iOS `.ipa` and Android `.aab` builds. The beta profile inherits the production EAS environment; do not use it for sandbox purchase tests or real-user test data without an owner-approved environment plan and isolated test backend.

### Accounts and one-time setup

1. Create/sign in to an Expo account and link this checkout to the correct EAS project. If `eas init` requests a project link, confirm that it is the owner’s Buko project. The app IDs must remain `com.cmgwynn.buko` on iOS and Android.
2. Join the Apple Developer Program and create the matching app record in App Store Connect. Apple requires a paid developer membership to submit an app. Provide the exact bundle ID already in `app.json`.
3. Create a Google Play developer account and the Buko app record using package name `com.cmgwynn.buko`. The Android application ID is permanent once the app record is created.
4. In the EAS project, set the public `EXPO_PUBLIC_*` values above for the environment used by the profile. Keep premium enforcement `false` in the staged build and leave unpublished policy/terms URLs unset until real HTTPS documents exist. Verify the environment selection before each build. These are build-time public values; never upload a private API key as an Expo public environment variable.
5. Configure iOS signing through EAS credentials. For Android submission, follow Expo’s current setup to create a Google Play service account and securely upload its JSON credential to EAS. Never check downloaded credentials into Git or share them in chat.
6. Complete the release build prerequisites in the checklist below, then build:

   ```bash
   npx eas-cli login
   npx eas-cli build --platform ios --profile beta
   npx eas-cli build --platform android --profile beta
   ```

   If Expo reports that the project is not linked, use `npx eas-cli init` and confirm the correct EAS project before continuing. Follow EAS prompts for signing credentials; do not paste secret values into this guide or source files.

### Upload beta builds

1. **iOS / TestFlight:** after the iOS beta-profile build finishes, upload it to App Store Connect. Actual store billing has not been exercised in these tests; do not treat a passing synthetic no-web-checkout check as proof of native purchase, entitlement verification or restore behavior:

   ```bash
   npx eas-cli submit --platform ios --latest --profile beta
   ```

   Wait for App Store Connect processing, then create an internal TestFlight group and invite App Store Connect team members. Internal TestFlight testers must be team users (up to 100); an internal-only build does not require beta review. Inviting external TestFlight testers can require TestFlight App Review, including review of the first build for that app/version. TestFlight is beta distribution, not public App Store release or App Review approval for production.

2. **Android / Play internal track:** create the first Play Console release and configure EAS’s Google Play service account, then upload the Android `.aab` with the configured beta submit profile:

   ```bash
   npx eas-cli submit --platform android --latest --profile beta
   ```

   The current `submit.beta` profile targets the Play **internal** track with release status **draft**. Confirm the draft in Play Console and publish it to that testing track before inviting testers. The separate `submit.production` profile targets production as a draft; do not select it for a beta.

3. Test the actual store-signed binaries, not only Expo Go, web, synthetic browser flows or a development client. The current 174-test/typecheck/Deno/synthetic-browser results do not exercise live Supabase Phase 5 migrations/functions, actual App Store or Play billing, or signed-device behavior. Capture issues, resolve blockers, rebuild, and repeat the platform tests.

4. Submit a production release only after owner approval, store declarations, review access, legal/owner facts, account deletion/export, paid-service decisions and all acceptance criteria are complete.

### Testing-track warning

Apple TestFlight internal testing is limited to App Store Connect team members and is not public release review. External TestFlight invitations can require a separate beta review.

Google Play internal testing is a useful early track but **does not satisfy** the closed-testing prerequisite for production access on personal Play developer accounts created after **November 13, 2023**. Google currently requires a closed test with at least **12 testers continuously opted in for 14 days**, followed by an application for production access. Confirm the account type/date and current Play Console requirements; allow the full testing period in the schedule.

## Backend and store rollout status

The owner reports Phases 5–7 backend setup through `0013` is complete. Do not rerun successful migrations. Recipe-quality migration `0014` and its focused tests are complete but not deployed; follow the README's Phase 8 setup, test on an isolated project first, then apply SQL, deploy the authenticated function with paid AI off and publish the frontend. Native store/device checks remain separate.

Keep premium rollout staged until specifically approved: `billing_config.enforce_premium=false`, `billing_config.allow_sandbox=false`, `EXPO_PUBLIC_PREMIUM_ENFORCEMENT=false`, `COACH_AI_ENABLED=false`, and `DIAGNOSTICS_ENABLED=false`. Do not add `ANTHROPIC_API_KEY` or enable a paid provider for a no-spend check. Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; never place the service key in the app. `REVENUECAT_SECRET_API_KEY` and `SENTRY_DSN` are server-only.

Test migration `0014` first against an isolated database. Verify owner-only provenance access, canonical fingerprint stability, immutable adaptation snapshots and RPC field casing (camel-case recipe summary fields; snake_case ingredient fields). Confirm origin and classification fields survive intended save/export paths without rewriting existing recipes. Normal private recipe create/import/edit must remain available when quality suggestions are unavailable. Saving a suggestion requires the explicit Find and save a private meal action; nothing is publicly published, planned or logged automatically. Show outcome, review note and base lineage, and treat dietary tags as descriptive rather than an allergy assurance. Require versioned recipe consent before model calls and retain the manual no-model path. These implementation details are not store claims until deployed and accepted.

Account export v2 is intended to include private recipe-photo originals in `assets[]` as base64 bytes with `encoding: "base64"`, content type, byte length and path; it does not ship expiring links or storage credentials. Server downloads are authenticated, bounded and sequential. Any download, empty/invalid-content or size failure must reject the complete export, never return a partial archive or link-only fallback. Limits are 25,000 database rows and photo objects, 1,000 photos, 5 MiB raw per photo and 20 MiB for the complete compact JSON including base64 expansion and client drafts/preferences. Both platform writers must check the final JSON size before saving. OS-level save behavior remains unverified.

## Premium and purchase release gates

No subscription is currently approved for a public launch. Current staged defaults are `EXPO_PUBLIC_PREMIUM_ENFORCEMENT=false`, database `billing_config.enforce_premium=false`, and `billing_config.allow_sandbox=false`. The implementation is being staged with a single RevenueCat entitlement named exactly `premium`; store trials are not automatically enabled. **No actual App Store or Google Play billing/purchase flow has been exercised.** Keep activation/paywalls off until each gate below passes on the production-signed binaries and against the configured store test environments:

- Configure matching **monthly** and **annual** products in Apple/Google and RevenueCat, map the approved RevenueCat offering/packages to the single `premium` entitlement, and set **actual localized prices** in each store. Product IDs and prices are not set in this document; align any chosen IDs with the release code and RevenueCat before testing. Do not hardcode a price or show a store price before the store product is configured and verified. RevenueCat purchasing is native-only.
- Configure a **seven-day introductory trial only for users each store considers eligible**; verify the eligibility response, offer presentation, trial-to-paid conversion terms and localized store disclosure. Do not promise every user a free trial.
- Use the platform billing system for native purchases. Verify receipts/transactions and premium entitlement server-side; the app UI alone is not authorization. A valid native entitlement may be recognized on web, but web must not start a checkout or accept a web payment.
- The `billing` Edge Function exposes authenticated `status` and `refresh` operations and checks the RevenueCat subscriber for the caller’s stable Supabase UUID. This identifier is pseudonymous, not anonymous; RevenueCat is a processor that can link the subscriber record and purchase state to that identifier. No webhook is configured: the app refreshes on manual/foreground checks, with a 10-per-minute server quota; server access is considered verified only when the cached verification is no more than 15 minutes old. Test expiry, stale/offline status and revocation behavior. Production must exclude sandbox purchases (`billing_config.allow_sandbox=false`); only a separate test project may enable sandbox acceptance.
- Test a fresh purchase, cancelled/pending/failed purchase, renewal, expiry, refund/revocation, reinstall, sign-in on a second device, restore purchases, and cross-platform entitlement recognition. Do not grant paid access automatically because a user tapped a paywall.
- Clearly show price, billing period, trial duration/eligibility and renewal/cancellation terms before purchase. Provide working **Restore Purchases** and **Manage subscription / Cancel** paths for the appropriate store.
- Confirm premium feature gates on both server and clients: recipe import and Coach server gates, plus the selected health/meal UI gates. Test unauthorized requests directly against server functions, not only by hiding buttons.
- Keep the paid entitlement, products, paywalls and public activation disabled until all of the above pass and the owner explicitly approves the launch. A beta build may be uploaded for testing, but never expose a public paid flow by default.
- Keep purchase packages/paywalls disabled while the rollout is staged or either real legal/document URL is missing. Test sandbox purchases only against a separate test Supabase/RevenueCat setup; never turn on sandbox acceptance in production.
- Confirm the database-side restrictive premium policies and Edge Function premium checks are active only in the explicitly approved enforcement rollout. In the current staged default, access enforcement is not publicly activated.

## Privacy, account, health and policy information to complete

This is a **factual coverage checklist, not legal policy or terms text**. No privacy policy, terms of service, medical disclaimer or legal representation is drafted here. An owner must supply accurate facts and get any required legal review before launch.

### Owner facts and public URLs still needed

- Legal developer/entity name, applicable contact and support email, support process, and approved public company/app URLs.
- Hosted privacy-policy URL required for the App Store listing; hosted terms/EULA URL if the owner chooses/needs one; Google Play account/data-deletion request URL. These URLs and their availability have not been confirmed here.
- Service/provider facts: Supabase project/hosting region and retention/backups; Anthropic processing/retention terms if Coach is activated; Open Food Facts, USDA, and user-selected recipe publishers; store billing providers; and what request metadata each can receive. Specifically verify which services can observe a user’s external IP address or connection metadata, which logs retain it, and for how long; an intermediary/backend call may expose the backend’s network identity to the downstream service rather than the user’s.
- Actual account data inventory, photo-storage behavior, export format and exclusions, deletion timing, and any legally or operationally retained billing/audit data.
- Markets/languages, age rating, content-rights confirmation for third-party data/assets, and contact details to show users.

### Factual disclosure inventory to verify against the shipped app

Before completing Apple App Privacy details, Google Play Data safety, privacy documents or a reviewer response, inventory the actual behavior and third-party SDKs, including:

- Account/email and authentication identifiers; profile and birthday/goal fields; nutrition diary, weight, workout and progress records; recipes, plans, grocery/pantry items and private recipe photos.
- Optional HealthKit/Health Connect permissions and exactly which records are read/written; user settings and consent; user-submitted recipe URLs/pasted text; product/nutrition searches; Coach messages/context only if activated; and subscription/transaction identifiers if billing ships.
- Optional diagnostics consent and the exact fixed event fields/processors. Authenticated relay traffic still reaches Supabase with account/session context; verify Supabase request/log metadata and the crash service’s relay IP/retention behavior. No raw errors or health/account payloads are sent to the crash service by the current relay.
- Purpose, storage destination, retention/deletion/export behavior, whether information is linked to an account, and disclosures for each processor/provider. Do not infer a “no collection” or “not shared” answer from the absence of ads or analytics alone.
- Current code has no analytics/ad SDK declared in the checked project dependencies, but verify the final native dependency inventory and any platform SDK behavior before making a store declaration.

### Account export and deletion release blocker

The account implementation provides **Settings → Privacy & account → Export data or delete account** (`/account`) and a public web entry at `/delete-account`; the owner must supply the actual HTTPS domain for the Play Console deletion URL. GitHub Pages has a static `/delete-account/index.html` fallback, but the deployed site route still needs an HTTP 200 check. The page calls the Supabase Edge Function named `account`; migration `0007_account.sql` provides service-only dynamic inventory/page export for UUID `user_id` tables and photo metadata. Export v2 is intended to embed original private recipe-photo bytes as base64 rather than return expiring links or storage credentials. This remains a **hard no-go** until verified on the release candidate and public URL:

- Provide the obvious in-app path (**Settings → Privacy & account → Export data or delete account → Permanently delete account**) and public request resource, including the logged-out landing/sign-in path. Deletion requires the account owner to sign in, type `DELETE`, and satisfy recent authentication (validated from GoTrue authentication method reference/sign-in time, not merely a refreshed JWT); confirming a password or signing in again may be required. Test incomplete profiles. Make clear account deactivation is not deletion.
- Verify authenticated owner export returns usable JSON and all expected user-owned data. Confirm each original private recipe photo is present as base64 in export v2; do not accept URLs, signed links, storage credentials or partial/link-only fallbacks. The full compact JSON, including base64 expansion, must remain within 20 MiB; database rows and photo objects are limited to 25,000, photo count to 1,000, and each raw photo to 5 MiB. Any empty/invalid/download/size failure must reject the complete archive. The export also includes this device’s unsaved recipe, workout and local diagnostics preference; both iOS and Android writers must check the final JSON size before saving.
- Verify the exported filename is `buko-export-{timestamp}.json`, the serialized object includes the device section, and it contains no access-token or refresh-token values. Synthetic browser testing confirmed Blob/anchor construction only; manually verify the file actually saves/opens on supported browsers and native share/save flows on signed iOS/Android builds.
- Verify deletion removes the account and all owner-linked data/storage objects, reports completion/errors honestly, and prevents orphaned records. Migration `0007` coordinates photo writes and auth deletion: photo insert/update takes a key-share lock on the owner row; auth deletion refuses while that account’s `recipe-photos` objects remain. Test the race by ensuring stale owner uploads are rejected after deletion. Validate the full current and future table/storage inventory, not only a manually selected list.
- Every user-specific billing table must have a `user_id` foreign key to `auth.users` with `ON DELETE CASCADE`. Any subscription, transaction, subscriber or event identity without `user_id`, and any audit/billing data intentionally retained, must be explicitly reported and coordinated for export/deletion/retention. Do not leave an undisclosed identifier or orphaned user data.
- Test the public deletion URL anonymously and with a deleted, signed-out, and incomplete-profile test account. Confirm the URL is accessible from both store forms before submission.
- Deletion of a Buko account does not cancel a subscription or refund a purchase. RevenueCat subscriber deletion is attempted only if `REVENUECAT_SECRET_API_KEY` is configured; it does not cancel a store subscription. Apple Health/Health Connect originals and records already written there remain in the health app. Provider logs, backups and external records may persist under their provider’s policies; do not promise unverified retention periods.

### Platform declarations and review

- **Apple:** complete App Privacy details for the release binary and all included SDKs; supply the privacy-policy URL; accurately describe account deletion/data use and optional HealthKit permissions. Check the current App Review Guidelines for privacy, HealthKit data, account deletion and in-app subscriptions. The HealthKit permission text in `app.json` currently says health data is never shared, while health integrations can synchronize selected records with Buko’s Supabase account; reconcile the exact scope and permission wording before signing. Do not present this as a blanket no-sharing promise.
- **Google Play:** complete the Health apps declaration even for testing tracks; this app includes nutrition/weight-management and activity/workout features and accesses Health Connect data. Declare each actual Health Connect permission and use in Play Console. Complete Data safety and account/data deletion questions; provide both in-app deletion and a working public request URL.
- **Subscriptions:** follow each store’s current digital-goods billing rules and subscription disclosures. Apple's guidelines require compliant in-app purchase/subscription handling; Google Play’s payments and subscriptions policy applies. Use current store links below and verify requirements for each market.
- Provide reviewer instructions and a test account if sign-in, health permission explanations, or subscription gating otherwise hides the behavior under review. Keep credentials private and rotate/delete test accounts after review.

## Device acceptance checklist — release blockers

Record device model, OS version, app build number, account type, network conditions, steps, expected result and actual result for every failure. Run on current supported iOS and Android phones, plus a web browser for parity checks where relevant. Do not describe a capability as available until its platform tests pass.

### Accessibility

- [ ] VoiceOver and TalkBack can navigate onboarding, sign-in, Scan/manual entry, product detail, diary, recipes/editing/import, meal plan, grocery, workout logging, health settings, profile, account export/deletion, Coach privacy settings and premium screens if enabled.
- [ ] Inspect the built Android merged manifest; verify `RECORD_AUDIO` is absent because Buko has no audio feature. A `recordAudioAndroid: false` Expo config option alone does not meet this acceptance check.
- [ ] Every icon-only button, switch, chart, score, camera control and destructive action has a meaningful accessible name, role/state and useful spoken result. Focus order follows the visual task order; modals announce and return focus correctly.
- [ ] At **200% text scaling** (or the platform’s largest supported accessibility text size), primary flows remain scrollable, labels do not overlap essential controls, and users can still reach Save, Back, permission, Restore, Manage and Delete actions.
- [ ] No meaning depends on color alone; score categories and chart series also have labels/text or patterns.
- [ ] Measure contrast on text and interactive states: target at least **4.5:1** for normal text and **3:1** for large text and essential control boundaries/icons. Fix failures before launch; this test is not a claim of WCAG certification.
- [ ] Reduced-motion settings do not prevent task completion or create disorienting movement.

### Scanner and product lookup

- [ ] On each native platform, grant camera permission, deny it, deny then re-enable it in system settings, and test without a camera. The explanation matches the prompt; manual barcode entry remains reachable.
- [ ] With permission granted, scan at least **20 known test labels per platform** across supported EAN-13, EAN-8, UPC-A and UPC-E formats; target at least **19/20 correct decodes** under ordinary indoor lighting, with no wrong product presented as a confident match.
- [ ] Test glare, blur, small/curved packaging, rotation, distance, low light and repeated barcodes. Show a useful retry/manual path for unreadable labels.
- [ ] Verify decode happens locally (no camera image upload); product lookup may send the barcode/query to Open Food Facts. Test known, unknown, incomplete and unavailable product records and check that data gaps remain explicit.
- [ ] On mobile web HTTPS, verify camera permission, local decoding and manual entry. Confirm the browser explains that ordinary non-secure local HTTP origins cannot access the camera.
- [ ] With airplane mode or a blocked provider, show a clear network/data-unavailable state and retry path; do not show stale/fabricated product results as current.

### Grocery, planning and network failure/recovery

- [ ] Online, generate groceries from a planned week and pantry; verify quantities/units, checked items, manual items and existing grocery rows behave as intended. Confirm regeneration does not unexpectedly replace manual or checked items.
- [ ] Test add/edit/check/delete/reorder, empty grocery list, large realistic list, duplicate ingredient merge, unsupported unit, pantry subtraction and failed/slow requests.
- [ ] Start edits while online, switch to airplane mode, and test each network-backed action. The app must not claim a change was saved unless confirmed; preserve unsaved input where the UI indicates it can be retried.
- [ ] Restore the connection and retry; verify no duplicated grocery lines, recipe saves, plan entries, diary entries or confirmed Coach actions.
- [ ] Record which exact views/data are usable offline versus unavailable. Until this passes, state that there is no supported/tested offline mode and make no offline claim.

### Performance, reliability and account

- [ ] On named representative devices, run **10 cold launches** and **20 key screen transitions** with normal connectivity. Record timings; release target: median cold launch to interactive screen ≤ **5 s**, and p95 transition to interactive content ≤ **1.5 s**. No hangs, crash loops or unresponsive controls.
- [ ] On the same devices, complete 20 successful barcode lookups and 20 grocery operations; record p50/p95 latency, errors and duplicate writes. Set a provider-aware target before release; do not mask slow network providers by promising a fixed result time.
- [ ] Run a 30-minute session through diary, recipe import/edit, grocery and workout flows; background/resume and rotate where supported; verify no lost data or unrecoverable screen state.
- [ ] Test fresh install, sign-up/sign-in, confirmation-email path if enabled, invalid credentials, expired session, sign-out, incomplete profile and app reinstall.
- [ ] Test owner export/deletion, anonymous public deletion request and the full deletion/storage/billing identity inventory described above.
- [ ] Verify real export file save/open from the browser download link and native share/save flow. The synthetic browser check observed Blob/anchor construction but no Playwright download event; do not count it as an end-to-end file-save test.
- [ ] Check account/settings layout at 320, 390, 844 and 1440 px widths for no horizontal page overflow, then test representative native text scaling and device layouts.
- [ ] Confirm server-side premium denial for non-entitled users and restore/cancel/refund/revocation behavior before any paid launch; keep the release disabled if any entitlement path is unresolved.
- [ ] Diagnostics are off by default. Test opt-in and withdrawal, confirm an off toggle sends no relay request, and verify accepted diagnostic payloads contain only the fixed error category/platform/fatal fields. Check the 5-per-minute server limit, test no raw message/stack, user ID, screen, health, chat or native dump reaches Sentry, and verify native crash reporting remains unavailable as disclosed.

## Official references

Recheck these current primary sources during submission; console workflows, device classes, testing gates and policy language can change. Links are operational references, not a determination that Buko complies.

### Expo / EAS

- [Build your project for app stores](https://docs.expo.dev/deploy/build-project/)
- [Submit to app stores](https://docs.expo.dev/deploy/submit-to-app-stores/)
- [Submit iOS with EAS](https://docs.expo.dev/submit/ios/)
- [Submit Android with EAS](https://docs.expo.dev/submit/android/)
- [Expo environment variables](https://docs.expo.dev/guides/environment-variables/)
- [EAS environment variables](https://docs.expo.dev/eas/environment-variables/)
- [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)

### Apple

- [App Store Connect app information and metadata](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Account deletion guideline](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple Developer Program](https://developer.apple.com/programs/)

### Google Play / Android

- [Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)
- [Add preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- [Account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291)
- [Testing requirements for personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Health Connect: publish and declare permissions](https://developer.android.com/health-and-fitness/health-connect/publish/declare-permissions)
- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/10281818)
- [Google Play developer account](https://play.google.com/console/about/)
