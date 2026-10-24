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
