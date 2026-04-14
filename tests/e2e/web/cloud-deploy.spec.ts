import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * Smoke test for the spec-089 cloud-deploy UI.
 *
 * Covers the SmartDeployButton + DeployPanel happy-path flow on the
 * application top bar. Stubs every HTTP route the page hits so the
 * test is deterministic and runs fully offline — no real cloud API
 * calls, no dependency on a fully-registered DI container, no SQLite
 * seeding.
 *
 * What this covers:
 *   1. The smart deploy split-button renders in the application top bar.
 *   2. Clicking the chevron opens the DeployPanel popover.
 *   3. The panel shows two rows (GitHub backup + cloud host).
 *   4. The cloud row's "Change provider" button expands the full
 *      provider list including enabled + disabled providers.
 *   5. Disabled stubs show "Coming soon" and enabled-but-disconnected
 *      Cloudflare Pages shows "Not connected".
 *   6. Clicking Cloudflare Pages opens the ConnectProviderModal dialog.
 */

const APP_ID = 'e2e-app-cloud-deploy';

const STUB_APPLICATION = {
  id: APP_ID,
  name: 'E2E Cloud Deploy App',
  slug: 'e2e-cloud-deploy-app',
  description: 'Smoke-test fixture for the cloud-deploy UI',
  repositoryPath: '/tmp/shep-e2e-cloud-deploy',
  additionalPaths: [],
  status: 'Idle',
  setupComplete: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const STUB_PROVIDERS = [
  { id: 'CloudflarePages', displayName: 'Cloudflare Pages', enabled: true, connected: false },
  { id: 'Vercel', displayName: 'Vercel', enabled: false, connected: false },
  { id: 'Netlify', displayName: 'Netlify', enabled: false, connected: false },
  { id: 'AwsAmplify', displayName: 'AWS Amplify', enabled: false, connected: false },
  { id: 'GcpCloudRun', displayName: 'Google Cloud Run', enabled: false, connected: false },
];

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('Cloud Deploy — application page smoke (spec 089)', () => {
  test.beforeEach(async ({ page }) => {
    // Primary application fetch. The application page expects the
    // enriched shape { application, initialChatState, deployment }
    // from GET /api/applications/:id, so stub all three branches.
    await page.route(`**/api/applications/${APP_ID}`, (route) =>
      fulfillJson(route, {
        application: STUB_APPLICATION,
        initialChatState: null,
        deployment: null,
      })
    );

    // Provider list for the DeployPanel.
    await page.route('**/api/cloud-providers', (route) =>
      fulfillJson(route, { providers: STUB_PROVIDERS })
    );

    // Side-routes the smart-deploy cluster + application page poll.
    await page.route('**/api/applications/*/files*', (route) => fulfillJson(route, { files: [] }));
    await page.route('**/api/applications/*/cloud-deploy/status', (route) =>
      fulfillJson(route, { status: null })
    );
    await page.route('**/api/applications/*/git/status', (route) =>
      fulfillJson(route, {
        branch: null,
        uncommittedCount: 0,
        unpushedCount: 0,
        hasRemote: false,
        remoteUrl: null,
      })
    );
    await page.route('**/api/operations/**', (route) => fulfillJson(route, { entries: [] }));
    await page.route('**/api/agent-events*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      })
    );
  });

  async function openDeployPanel(page: Page): Promise<void> {
    // The smart deploy button is a split button — the chevron on the
    // right opens the panel. Use its aria-label (stable) rather than
    // the dynamic primary-click label which depends on smart state.
    const chevron = page.getByRole('button', { name: 'Open deploy panel' });
    await expect(chevron).toBeVisible({ timeout: 20000 });
    await chevron.click();
    // The panel renders two ServiceRow titles — waiting on the
    // "No backup yet" row is the most stable signal that the popover
    // has mounted.
    await expect(page.getByText(/No backup yet/i)).toBeVisible();
  }

  async function expandProviderList(page: Page): Promise<void> {
    // "Change provider" chevron inside the cloud host ServiceRow.
    // It's rendered as the collapsed-state toggle of the ProviderList.
    const changeProviderButton = page.getByRole('button', { name: /Change provider/i });
    await expect(changeProviderButton).toBeVisible();
    await changeProviderButton.click();
  }

  test('deploy button renders and provider list shows every provider', async ({ page }) => {
    await page.goto(`/application/${APP_ID}`);

    // Smart deploy split-button is mounted.
    await expect(page.getByRole('button', { name: 'Open deploy panel' })).toBeVisible({
      timeout: 20000,
    });

    await openDeployPanel(page);
    await expandProviderList(page);

    // Every known provider surfaces as a row in the expanded list.
    // Rows are plain <button> elements so we match by accessible name
    // instead of the old Radix menuitem role.
    await expect(
      page.getByRole('button', { name: /Cloudflare Pages.*Not connected/i })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Vercel.*Coming soon/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Netlify.*Coming soon/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /AWS Amplify.*Coming soon/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Google Cloud Run.*Coming soon/i })
    ).toBeVisible();
  });

  test('stub providers show "Coming soon" and Cloudflare shows "Not connected"', async ({
    page,
  }) => {
    await page.goto(`/application/${APP_ID}`);
    await openDeployPanel(page);
    await expandProviderList(page);

    // Cloudflare is enabled but has no stored token.
    const cloudflareRow = page.getByRole('button', { name: /Cloudflare Pages/i });
    await expect(cloudflareRow).toContainText(/Not connected/i);
    await expect(cloudflareRow).toBeEnabled();

    // Every disabled stub row renders as "Coming soon" and is
    // not clickable.
    const comingSoonProviders = [/Vercel/i, /Netlify/i, /AWS Amplify/i, /Google Cloud Run/i];
    for (const label of comingSoonProviders) {
      const row = page.getByRole('button', { name: label });
      await expect(row).toContainText(/Coming soon/i);
      await expect(row).toBeDisabled();
    }
  });

  test('selecting Cloudflare Pages opens the connect-provider modal', async ({ page }) => {
    await page.goto(`/application/${APP_ID}`);
    await openDeployPanel(page);
    await expandProviderList(page);

    // Cloudflare is enabled-but-not-connected => clicking should open
    // the ConnectProviderModal (Radix Dialog).
    await page.getByRole('button', { name: /Cloudflare Pages.*Not connected/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Connect to Cloudflare Pages/i);
    // The Connect button is disabled until the user pastes a token.
    await expect(dialog.getByRole('button', { name: /^Connect$/ })).toBeDisabled();

    // Cancel out — we are not testing the real connect network call here.
    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
