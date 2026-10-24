# Testing

Use Node 24 LTS or newer (the Node test runner must support file globs).
Run `npm test` for both test suites or `npm run verify` for tests plus TypeScript
checking. `npm run test:unit` preserves the existing Node-based `tsx` tests
(`src/**/*.test.ts`). `npm run test:components` runs Expo/Jest tests named
`*.jest.test.ts` or `*.jest.test.tsx`; keeping the suffix distinct prevents
Jest from taking over the Node suite.

The component suite uses `jest-expo` and `babel-preset-expo` aligned to Expo 57,
the React Native Jest preset for 0.86.3, React Native Testing Library 14.1 for
interactions, and `react-test-renderer` matched to React 19.2.3; the library's
`test-renderer` peer is also installed. Run tests without native device
services; mock a native module only when the tested component actually imports
it.

GitHub Actions runs `npm ci` and `npm run verify` with Node 24 for pull requests
and manual test runs. The main-branch web deployment workflow also runs this
verification gate before exporting the app.

Jest's configuration sets `America/Los_Angeles` before starting workers so DST
tests exercise 23- and 25-hour days consistently, even on UTC CI machines.

Workout coverage includes set completion/Undo and optional RPE controls, durable
autosave/resume, offline identity/profile recovery, queue retries and owner checks,
and personal-record rules. The static-shell test verifies that API requests,
credential-bearing resource URLs and other origins are not intercepted.
Native haptics, audio, notification delivery, Live Activities and health exports
need signed-device acceptance in addition to mocked/pure tests.

For a focused workout pass:

```sh
npx tsx --test src/lib/fitness/__tests__/engine.test.ts src/lib/fitness/__tests__/offlineStore.test.ts src/lib/fitness/__tests__/workoutDatabase.test.ts
npm run test:components -- --runInBand src/components/workout src/lib/workoutNative/useWorkoutNative.jest.test.tsx
```

`npm run build:web` also generates the production static offline shell.
Native setup and manual acceptance steps are in
[WORKOUT-NATIVE.md](./docs/WORKOUT-NATIVE.md).

Recipe quality coverage includes deterministic seasoning/portion/time rules,
bounded chef-review regeneration and compatible fallback, admin authority,
version immutability, feedback idempotency and owner/provenance checks.
Cooking feedback and non-admin deep-link gates have component tests. Human
cooking tests are separate: passing an automated or AI review must never mark
an existing library recipe physically tested.

```sh
npx tsx --test "src/lib/recipes/quality/*.test.ts" src/lib/recipes/qualityDatabase.test.ts
npm run test:components -- --runInBand src/components/RecipeAdmin.jest.test.tsx src/components/RecipeTasteFeedback.jest.test.tsx src/lib/recipes/qualityClient.jest.test.tsx
npx --yes deno check supabase/functions/recipe-quality/index.ts
```

The concurrent HTTP fixture holds the first model call while a duplicate request
arrives. PGlite exercises transaction locks/claim expiry but serializes submitted
queries, so it does not establish distributed exactly-once behavior. No test
uses a real paid model.
