import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const e2eShepHome = join(tmpdir(), `shep-e2e-web-${process.pid}`);
process.env.SHEP_HOME = e2eShepHome;

/**
 * Playwright configuration for Shep AI Web UI E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e/web',
  globalSetup: './tests/e2e/web/global-setup.ts',
  globalTeardown: './tests/e2e/web/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/realtime-showcase*',
    },
    // Showcase project — requires a live dev server (localhost:3000).
    // Run explicitly: npx playwright test --project showcase
    ...(process.env.SHOWCASE_URL
      ? [
          {
            name: 'showcase',
            use: {
              ...devices['Desktop Chrome'],
              video: 'on' as const,
              launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
            },
            testMatch: 'realtime-showcase.spec.ts',
          },
        ]
      : []),
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev:web',
    env: {
      PORT: '3001',
      SHEP_COLLABORATION_FLAG: '1',
      SHEP_MOCK_GATEWAY: '1',
      SHEP_HOME: e2eShepHome,
    },
    url: 'http://localhost:3001',
    // The fixture database and web server must share the isolated SHEP_HOME.
    // Reusing an arbitrary local server would make this suite data-dependent.
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
