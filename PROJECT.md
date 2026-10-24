# Buko

## Vision
Buko closes the loop between what you buy, what you cook, and how you train. One app to:
scan products → plan meals → generate grocery lists → cook → log what you eat → track workouts → adjust goals.
It combines a food-scanning product rater (like Yuka) with a nutrition and fitness tracker (like MyFitnessPal).

Principles
- Every health score is explainable and tied to a named source.
- Privacy first: no behavioral analytics, ads, or tracking SDKs. Account data lives in our Supabase project. Public food lookups use Open Food Facts/USDA and requested recipe imports fetch the publisher. Optional diagnostics are separately consented, off by default and restricted to fixed technical signals through a server relay. Optional Coach processing requires explicit consent before minimized context/chat can go to Anthropic; weight sharing is separate and imported health-app workouts/energy are excluded.
- Calm, minimal, modern design driven by a single theme file (`src/theme/index.ts`).
- Preference-driven automation: users choose goals, preferences and constraints; Buko uses those choices to reduce daily work. Customization should guide automation, not create more manual chores. Keep suggestions explainable, adjustable and easy to override.

## Tech stack
- Expo (React Native) + TypeScript
- Expo Router (file-based navigation, `Stack.Protected` for the auth → onboarding → app gate)
- Supabase: Auth + Postgres, row-level security on every table
- Open Food Facts: barcode/product data (descriptive User-Agent sent; attribution shown in app)
- USDA FoodData Central: whole-food nutrition data (Foundation + SR Legacy)
- Dev target: Expo Go on iOS/Android

## Phase plan
| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Auth + onboarding + Mifflin-St Jeor targets; barcode scanner with explainable 0–100 score and alternatives; food diary + daily dashboard; grocery list | **Done**: tested end-to-end on a real phone with Expo Go (2026-10-19) |
| 2 | Recipes (own + URL import), weekly meal planner, grocery generation, pantry, cooking mode, scaling | **Built**; migration `0002` must be run; drag, notifications, photos and live URL import not yet tested on a device |
| 3 | Fitness: workouts, exercise library, routines, progress charts, HealthKit / Health Connect, activity-adjusted calorie target | **Built**; migration `0003` must be run; health integrations need a development build and are untested on a device |
| 4 | Opt-in AI wellness coach: factual weekly reviews, own-data chat, confirmed meal-plan/grocery suggestions, preference/privacy controls | **Backend setup confirmed working by owner**; paid Anthropic AI deliberately disabled. No automatic target adjustment. |
| 5 | Native app-store preparation: subscriptions/entitlement, account export/deletion, opt-in diagnostics, EAS/TestFlight/Play testing, accessibility and release declarations | **Implementation in progress**: 174 tests across 31 suites, typecheck, five Deno entry-point checks and web/native JavaScript exports pass. Synthetic browser checks cover diagnostics, legal-link handling, no web checkout, gated plan access, account confirmation/failure, logged-out delete-page behavior and JSON export Blob/anchor construction; OS file-save was not verified. These do not verify live Phase 5 backend deployment, actual App Store/Play billing or signed-device behavior. No signed binaries verified; Phase 5 backend migrations/functions are not deployed. Config introspection confirms `MainActivity` `singleTop` and a manifest merger removal rule for Android `RECORD_AUDIO`; the final signed manifest still needs verification. Store/provider setup, device acceptance, assets/declarations and release testing remain blockers. No public paid activation. |

Store and beta submission notes, proposed listing copy, official references and the release go/no-go checklist are in [`docs/STORE-LAUNCH.md`](./docs/STORE-LAUNCH.md). Its status is deliberately not “launch ready”: do not infer policy compliance, account deletion readiness, purchase readiness or production eligibility from the guide.

### Recipe library
- 72 original recipes, with at least six per cuisine and every meal type represented in all ten cuisine inspirations. Meal/cuisine filters combine with title/ingredient search; browsing reveals 12 cards at a time.
- All unmodified library recipes must score at least 75/100 (Excellent) under the unchanged Buko recipe-scoring model, with complete nutrient fields and no excluded ingredients. Ingredient weights and USDA SR Legacy snapshots retrieved 2026-10-24 are bundled, so previews and editable copies need no live nutrition lookup. Source records are linked in ingredient previews.
- Scores use listed input weights, not measured cooked yield. They are estimates, not medical suitability certifications; ingredient brands, substitutions and edits can change scores. Each copy retains independently editable matched nutrients/weights, and existing private recipes are never rewritten.

### Phase 4 implementation and automation direction
- Supabase authenticates every Coach request, reads owner-scoped bounded data, calculates facts and filters candidates before calling Anthropic from the Edge Function only. Model output is validated, not trusted as a calculator or database command.
- Previous completed Monday-Sunday weekly reviews distinguish incomplete logging, current product scores and uncertain weight trends. Optional complete-day markers and observed target snapshots support comparisons only with at least four comparable days. Missing days are not zero intake.
- Coaching focus guides suggestions; explicit user confirmation is required for every recipe-to-plan/product-to-grocery action. Owner-only RPCs recheck consent, support mode, dietary restrictions, recipe ownership/version and expiry, and record idempotent receipts.
- Saved recipes need complete calorie/protein ingredient matching for numeric constraints. High-protein means at least 20 g per serving. Recipes have no meal-type classification: users review suitability and choose the meal slot. Dietary restrictions conservatively suppress food actions because suitability is unverified.
- User-selectable weight sharing is off by default. Structured model context excludes names, emails, account IDs and birthday; free-text redaction is best effort. Explicit consent, withdrawal and history deletion are available. Provider retention terms still apply.
- Medical/eating-disorder system instructions, heuristic routing and fail-closed output validation complement the existing calorie floors. Support mode pauses numeric feedback/actions and shares the National Alliance for Eating Disorders resource. These safeguards do not constitute medical care or a guarantee of detection.
- Live AI requires explicit owner enablement, API key and model configuration. Default rollout is no-spend: factual summaries work after backend setup without a model key. Limits are 5/minute and 30/UTC day/user plus a global daily reservation cap; no scheduled/background model calls.
- No adaptive target changes or manual-target overrides in this release. Future automation must keep calculated recommendations separate from explicit overrides, explain changes, permit pause/override and preserve existing safety limits. Schedule/practical-constraint customization remains future work.

## Layout
- `app/` – Expo Router screens: `(auth)`, `onboarding`, `(tabs)` (diary, scan, plan, train, recipes; grocery is a hidden tab opened from a Plan header button), `workout/*`, `exercise/[id]`, `progress`, `body`, `health`, `profile` (header button), `account`, `delete-account`, `premium`, `product/[barcode]`, `log/*`, `edit-profile`, `recipe/*`, `cook/*`, `grocery/generate`, `pantry`
- `src/lib/scoring/` – isolated health-score module (`config.ts` = all weights/thresholds/sources, `factors.ts`, `index.ts`)
- `src/lib/nutrition/targets.ts` – Mifflin-St Jeor, calorie floors, macro split
- `src/lib/api/` – Open Food Facts, USDA, alternatives
- `src/lib/recipes/` – ingredient parser, units, schema.org import, recipe nutrition/score, grocery builder, week helpers
- `src/lib/fitness/` – workout maths (e1RM, volume, PRs, moving average, MET estimates, activity-adjusted targets), data access, active-workout session store
- `src/lib/health/` – HealthKit (`ios.ts`) and Health Connect (`android.ts`) adapters behind one interface, sync and write-back (`index.ts`)
- `src/providers/SettingsProvider.tsx` – per-user settings (activity adjust, health toggles)
- `src/lib/coach/`, `supabase/functions/coach/`, `app/coach.tsx` - shared facts/protocol, server-only model integration, consent/review/chat/action UI
- `src/lib/diagnostics/`, `supabase/functions/diagnostics/`, `app/settings.tsx` - per-account/device opt-in for restricted diagnostic signals; default off
- `supabase/migrations/0001_init.sql` through `0008_diagnostics.sql` - schema + RLS, birthdays, coach quota/action RPCs, billing, account export/deletion and diagnostic relay quota

## Decisions
Log every architectural decision here (newest last).

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| 1 | 2026-10-19 | Stack: Expo + TS, Expo Router, Supabase, Open Food Facts, USDA FDC | Per founders' brief |
| 2 | 2026-10-19 | Scoring logic isolated in `src/lib/scoring/` as pure functions; all weights, thresholds and source citations in `config.ts` | Tunable and unit-testable; no network/UI dependencies |
| 3 | 2026-10-19 | No shared product cache table; diary entries and grocery items store their own nutrition snapshot | Keeps RLS strictly per-user; history survives upstream data changes |
| 4 | 2026-10-19 | Product detail scores are computed on-device, never stored as canonical ratings. Phase 4 also computes current scores server-side using the same pure module and stores review summaries. | Retuning weights needs no product-cache migration; saved Coach check-ins remain dated snapshots. |
| 5 | 2026-10-19 | Missing score inputs are excluded and weights redistributed; below 40 known weight we show "not enough data" | Don't punish products for missing data, but don't invent scores |
| 6 | 2026-10-19 | Calorie floor is enforced by clamping (1,200 women / 1,500 men) and a visible warning, stored as `nutrition_targets.floor_applied` | Never silently set an unsafe target; replaces the earlier `below_floor_acknowledged` idea |
| 7 | 2026-10-19 | "Prefer not to say" sex uses the Mifflin-St Jeor midpoint offset (−78) and the higher 1,500 kcal floor | Conservative default |
| 8 | 2026-10-19 | Macros: protein 1.8/1.6/2.0 g/kg (lose/maintain/gain), fat 25% of kcal, carbs the remainder. Goal adjustment −500/0/+300 kcal | Approved by founders |
| 9 | 2026-10-19 | Store `birth_year` (derived from entered age) instead of `birth_date`; app is 18+ only. Superseded by decision 27. | Original onboarding asked for age, not date of birth; the calculation isn't validated for minors |
| 10 | 2026-10-19 | Height/weight stored metric; `units` preference stored for display | Calculation in one unit system, friendly input |
| 11 | 2026-10-19 | Session persisted in AsyncStorage; `EXPO_PUBLIC_*` env vars for Supabase URL/anon key and USDA key | Simple under Expo Go; anon key is public by design, protected by RLS; USDA key is free/low-risk (approved) |
| 12 | 2026-10-19 | Email confirmation: app handles both modes; README recommends turning it off in Supabase while developing | Least friction on phones with Expo Go |
| 13 | 2026-10-19 | Alternatives come from the two most specific Open Food Facts categories, scored by our own module, and must beat the scanned product by ≥10 points | Broader categories drift off-topic |
| 14 | 2026-10-19 | Diet preferences only flag conflicts on scanned products (from OFF ingredient analysis/allergen tags); they don't change targets | Approved by founders. Missing data is never treated as "safe" |
| 15 | 2026-10-19 | Packaged-food search uses Open Food Facts text search on submit only (no search-as-you-type) | OFF rate-limits search (~10 req/min) |
| 16 | 2026-10-19 | Stay on the Expo SDK supported by the App Store version of Expo Go (currently SDK 57), not the newest SDK | SDK 58 made Expo Go show "app needs updating". Check `https://api.expo.dev/v2/versions/latest` (`expoGoSdkVersion`) before upgrading |
| 17 | 2026-10-19 | Phase 2 recipe import fetches the URL directly from the phone and parses only schema.org Recipe JSON-LD (name, ingredients, steps, times, servings); source URL always stored and shown; no images or other text copied | Approved by founders. This is a new outbound call to arbitrary recipe sites, with no user data sent |
| 18 | 2026-10-19 | Own Nutri-Score implementation (2023 general-food tables) in `scoring/nutriscore.ts` for recipes, so recipe scores use the existing scoring module with Nutri-Score present, NOVA absent and additives marked unknown (weights redistributed) | Recipes have no official grade. Matched Open Food Facts on 9/10 test products; beverages, fats, cheese tables and red-meat cap are not implemented |
| 19 | 2026-10-19 | Tabs are Diary, Scan, Plan, Recipes, Grocery; Profile moves to a header button | Approved. Five tabs is the maximum that stays readable |
| 20 | 2026-10-19 | Recipe photos: user's own photos only, resized to 1200px JPEG, private `recipe-photos` bucket, per-user folder policies, signed URLs | No third-party images, no public links |
| 21 | 2026-10-19 | Timers use local notifications only (no push service, no tokens leave the device) | Keeps the no-tracking rule |
| 22 | 2026-10-19 | `meal_plan_entries.servings` = servings the user eats; grocery generation scales each recipe to the sum of planned servings; entries already logged are excluded | Keeps planner, grocery and diary consistent |
| 23 | 2026-10-19 | Grocery generation merges only same-dimension units (mass/volume/count); pantry items subtract when same dimension, a name-only pantry item removes the line; regenerating replaces that week's unchecked generated items | Avoids unsafe unit guesses; never touches manual or checked items |
| 24 | 2026-10-19 | Drag-and-drop in the planner (long-press) with tap-to-pick fallback | Approved; drag is the riskiest feature on-device |
| 25 | 2026-10-19 | Recipe accuracy pass after device testing: package sizes ("(8 ounce) package") set the real weight; herbs, greens, sprouts, nuts and chopped veg get realistic densities; USDA matching rewrites awkward names, penalises candy/restaurant/"light" results and returns no match instead of a wrong one (seasoning mixes are left for the user); edit screen shows per-ingredient kcal, the site's own calories for comparison, and a warning when servings were assumed | Imported recipes were off by hundreds of kcal (candy mint, water-density herbs, a missing bag of fries). Traced against two real recipes: 908 → 687 kcal vs the site's 659 |
| 26 | 2026-10-19 | Planned meals reach the diary: one-tap Log on each planned entry in the Diary and Plan tabs, plus an "Add recipe" option per meal in the Diary; all use one shared `logRecipeServings` | Planning shouldn't mean re-entering meals |
| 27 | 2026-10-23 | Store private `birth_date` through additive migration `0004`; preserve nullable legacy birthdays and retain `birth_year` for compatibility. Use completed local-calendar age, with Feb 29 advancing March 1 in non-leap years. Derive formula-based targets on-device at local midnight/resume without writing over stored targets or food history. | Age should update on the actual birthday. Never fabricate birthdays from approximate birth years. New/updated profiles still require ages 18–100. |
| 28 | 2026-10-23 | Phase 4 customization should steer explainable automation through users' goals, preferences and constraints, with pause/override controls and safety limits. | Reduce the effort of maintaining a healthy lifestyle while keeping users in control; the approved initial Coach scope is recorded below. |
| 29 | 2026-10-23 | Implement approved Phase 4 as an opt-in Anthropic wellness coach, not autonomous adaptive targets; keep live AI off until separately configured. | Owner chose a no-spend proof of concept. Supabase Free hosting does not make Anthropic API usage free. |
| 30 | 2026-10-23 | Deterministic bounded facts, unknown missing days, complete-day/target snapshots, verified recipe constraints, current shared product scoring; nonnumeric validated model prose and allowlisted actions. | Model output must not invent authoritative nutrition, diagnoses, unsafe targets or database operations. Saved recipes only; no invented dinner classification or allergen assurances. |
| 31 | 2026-10-23 | Owner-scoped coaching tables/RLS, atomic per-user/global request reservations and idempotent confirmed actions; separate weight opt-in, revocable versioned consent and deletable history. | Protect privacy and control costs while preserving user's existing plan/grocery entries. Imported health-app activity never enters model context. |
| 32 | 2026-10-23 | Browser barcode decoding runs locally with ZXing over an explicitly started HTTPS camera stream. URL recipe import uses an authenticated HTTPS host allowlist on both web/native; local paste-text drafts are the primary blocked-site fallback. | Make iPhone web trials practical without transmitting camera frames or requiring HTML downloads; do not bypass publisher blocks. |

### Phase 2 schema (`0002_recipes_planning.sql`, all RLS, owner-only)
- `recipes`, `recipe_ingredients`, `recipe_steps` (child tables also require the parent recipe to be owned by the caller)
- `meal_plan_entries` (date, slot, recipe, servings, `logged_at`)
- `pantry_items` (unique per user on canonical name)
- `grocery_items`: new `quantity_value`, `unit`, `section`, `generated_week`, `from_recipes`; source allows `'plan'`
- `food_log_entries`: source allows `'recipe'`
- Private storage bucket `recipe-photos` with per-user-folder policies
