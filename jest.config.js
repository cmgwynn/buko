// Set before Jest starts workers; changing TZ inside its isolated test globals is ineffective.
process.env.TZ = 'America/Los_Angeles';

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.jest.test.[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};
