module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.jest.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};
