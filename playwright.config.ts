/**
 * Playwright + playwright-bdd config for the E2E harness (issue #19).
 *
 * playwright-bdd compiles the Gherkin under e2e/features/ onto the Playwright runner: `bddgen` reads
 * this config, generates spec files from the features into `.features-gen/`, and `playwright test`
 * runs them (see the `test:e2e` npm script). Step definitions live in e2e/steps/.
 *
 * The suite owns app bring-up itself: `globalSetup` builds once so every face runs against fresh
 * `dist/`, and each scenario spawns its own `view` process via the fixtures (e2e/steps/fixtures.ts),
 * parsing the real bound URL. Serialised (workers: 1) so the process-global session never overlaps
 * and so spawn/teardown stays deterministic on Windows and Linux.
 */
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
});

export default defineConfig({
  testDir,
  globalSetup: './e2e/support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
