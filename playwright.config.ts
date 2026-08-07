/**
 * Playwright Test configuration.
 *
 * Two projects separate concerns that need different execution semantics:
 *   functional  fully parallel, the bulk of the suite
 *   contract    serial, because it reads and writes snapshot files
 *
 * Everything tunable is sourced from `config`, so a CI job changes behaviour
 * through environment variables rather than by editing this file.
 */
import { defineConfig } from '@playwright/test';

import { config } from './src/config/environments';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  // A test that needs more than this is doing too much.
  timeout: config.timeouts.test,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  // Guard against a stray `test.only` reaching main.
  forbidOnly: config.isCI,

  /**
   * Retries exist for transport flakiness in a shared public sandbox behind a
   * CDN, not to paper over assertion instability: the HTTP client already
   * retries 5xx/429 internally, so a retry here means something rarer.
   */
  retries: config.isCI ? 2 : 0,

  /**
   * The API is a shared, rate-limited sandbox. Four workers is the measured
   * sweet spot between wall-clock time and provoking CDN throttling.
   */
  workers: config.isCI ? 4 : 4,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['./reporters/defect-register.reporter.ts'],
  ],

  use: {
    baseURL: config.baseUrl,
    extraHTTPHeaders: {
      accept: 'application/json',
    },
    // Captured on the first retry only - enough to diagnose without bloating
    // artifacts on a green run.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'functional',
      testIgnore: ['**/contract/**'],
    },
    {
      name: 'contract',
      testMatch: ['**/contract/**/*.spec.ts'],
      // Snapshot files are shared state; serialise to keep writes safe.
      fullyParallel: false,
      workers: 1,
    },
  ],

  metadata: {
    environment: config.environment,
    baseUrl: config.baseUrl,
    contractMode: config.contracts.update ? 'update' : 'verify',
  },
});
