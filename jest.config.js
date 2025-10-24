module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js',
    '!**/tests/integration/**' // Exclude integration tests by default
  ],
  collectCoverageFrom: [
    'scripts/**/*.{js,cjs}',
    '!scripts/**/*.test.{js,cjs}',
    '!scripts/**/*.spec.{js,cjs}'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000 // 10 second timeout
};