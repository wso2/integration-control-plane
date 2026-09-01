import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Kept at 1 in CI: every spec shares the single session storageState global.setup.ts writes to
  // .auth/user.json, including one shared refresh token. authenticatedFetch (tokenManager.ts)
  // refreshes on ANY 401 — not just genuine expiry — so even with a fresh access token, a single
  // transient 401 on one worker's request would rotate the shared refresh token out from under
  // every other concurrently-running worker, breaking their sessions for the rest of the run.
  // Enabling multiple workers safely needs worker-isolated auth state (e.g. a separate login per
  // worker), not just a config change here.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://preview-o2-dev.devant.dev',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'setup',
      testDir: './tests/e2e',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'wip',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
        launchOptions: {
          args: ['--incognito'],
        },
      },
      dependencies: ['setup'],
    },
  ],
  outputDir: 'test-results/',
});
