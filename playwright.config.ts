/**
 * @file playwright.config.ts
 * @description Global Playwright test configuration for Grafana Warp10 plugin testing.
 *
 * This config:
 * - Defines test directories and test match patterns
 * - Enables multiple browser projects (Chromium, Firefox)
 * - Integrates authentication via @grafana/plugin-e2e
 * - Enables parallelism, retries (CI), HTML reporting, and baseURL support
 *
 * Notes:
 * - The 'auth' project runs the login scenario first and stores credentials
 * - All other projects depend on 'auth' and reuse the stored state
 * - Test files should be placed in `./tests` directory and use `.spec.ts` extension
 */
import type { PluginOptions } from '@grafana/plugin-e2e';
import { defineConfig, devices } from '@playwright/test';
import { dirname } from 'node:path';

const pluginE2eAuth = `${dirname(require.resolve('@grafana/plugin-e2e'))}/auth`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<PluginOptions>({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.GRAFANA_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    // 1. Login to Grafana and store the cookie on disk for use in other tests.
    {
      name: 'auth',
      testDir: pluginE2eAuth,
      testMatch: [/.*\.js/],
    },
    // 2. Run tests in Google Chrome. Every test will start authenticated as admin user.
    {
      name: 'chromium',
      testDir: './tests',
      testMatch: ['*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
        launchOptions: {
          args: ['--enable-unsafe-swiftshader'],
        },
      },
      dependencies: ['auth'],
    },
    {
      name: 'firefox',
      testDir: './tests',
      testMatch: ['*.spec.ts'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['auth'],
    },
  ],
});
