# Buko

## Vision
Buko closes the loop between what you buy, what you cook, and how you train. One app to:
scan products → plan meals → generate grocery lists → cook → log what you eat → track workouts → adjust goals.
It combines a food-scanning product rater (like Yuka) with a nutrition and fitness tracker (like MyFitnessPal).

Principles
- Every health score is explainable and tied to a named source.
- Privacy first: no analytics, ads, or tracking SDKs. User data goes nowhere except our Supabase project; the only third-party calls are food lookups (Open Food Facts, USDA).
- Calm, minimal, modern design driven by a single theme file (`src/theme/index.ts`).

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
| 3 | Workout tracking; calorie burn feeds into the diary | Not started |
| 4 | Adaptive goals: adjust targets from weight trend, intake, and activity | Not started |

## Layout
- `app/` – Expo Router screens: `(auth)`, `onboarding`, `(tabs)` (diary, scan, plan, recipes, grocery), `profile` (header button), `product/[barcode]`, `log/*`, `edit-profile`, `recipe/*`, `cook/*`, `grocery/generate`, `pantry`
- `src/lib/scoring/` – isolated health-score module (`config.ts` = all weights/thresholds/sources, `factors.ts`, `index.ts`)
- `src/lib/nutrition/targets.ts` – Mifflin-St Jeor, calorie floors, macro split
- `src/lib/api/` – Open Food Facts, USDA, alternatives
- `src/lib/recipes/` – ingredient parser, units, schema.org import, recipe nutrition/score, grocery builder, week helpers
- `supabase/migrations/0001_init.sql`, `0002_recipes_planning.sql` – schema + RLS

## Decisions
Log every architectural decision here (newest last).

| # | Date | Decision | Rationale |
|---|------|----------|-----------|
| 1 | 2026-10-19 | Stack: Expo + TS, Expo Router, Supabase, Open Food Facts, USDA FDC | Per founders' brief |
| 2 | 2026-10-19 | Scoring logic isolated in `src/lib/scoring/` as pure functions; all weights, thresholds and source citations in `config.ts` | Tunable and unit-testable; no network/UI dependencies |
| 3 | 2026-10-19 | No shared product cache table; diary entries and grocery items store their own nutrition snapshot | Keeps RLS strictly per-user; history survives upstream data changes |
| 4 | 2026-10-19 | Scores are computed on-device, never stored | Retuning weights needs no data migration |
| 5 | 2026-10-19 | Missing score inputs are excluded and weights redistributed; below 40 known weight we show "not enough data" | Don't punish products for missing data, but don't invent scores |
| 6 | 2026-10-19 | Calorie floor is enforced by clamping (1,200 women / 1,500 men) and a visible warning, stored as `nutrition_targets.floor_applied` | Never silently set an unsafe target; replaces the earlier `below_floor_acknowledged` idea |
| 7 | 2026-10-19 | "Prefer not to say" sex uses the Mifflin-St Jeor midpoint offset (−78) and the higher 1,500 kcal floor | Conservative default |
| 8 | 2026-10-19 | Macros: protein 1.8/1.6/2.0 g/kg (lose/maintain/gain), fat 25% of kcal, carbs the remainder. Goal adjustment −500/0/+300 kcal | Approved by founders |
| 9 | 2026-10-19 | Store `birth_year` (derived from entered age) instead of `birth_date`; app is 18+ only | Onboarding asks for age, not date of birth; the calculation isn't validated for minors |
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

### Phase 2 schema (`0002_recipes_planning.sql`, all RLS, owner-only)
- `recipes`, `recipe_ingredients`, `recipe_steps` (child tables also require the parent recipe to be owned by the caller)
- `meal_plan_entries` (date, slot, recipe, servings, `logged_at`)
- `pantry_items` (unique per user on canonical name)
- `grocery_items`: new `quantity_value`, `unit`, `section`, `generated_week`, `from_recipes`; source allows `'plan'`
- `food_log_entries`: source allows `'recipe'`
- Private storage bucket `recipe-photos` with per-user-folder policies
