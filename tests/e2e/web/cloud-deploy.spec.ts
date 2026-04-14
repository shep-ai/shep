import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * Smoke test for the spec-089 cloud-deploy UI (task t-51).
 *
 * Scope: exercises the DeployButton + ProviderDropdown happy path on
 * the application page. Stubs the HTTP routes the page hits so the
 * test is deterministic and runs fully offline — no real cloud API
 * calls, no dependency on a fully-registered DI container, no SQLite
 * seeding. Network interception is the same pattern used by
 * `feature-create-drawer.spec.ts`.
 *
 * What this covers:
 *   1. Deploy button renders in the application top bar.
 *   2. Clicking the provider switcher opens a Radix dropdown listing
 *      every known provider (Cloudflare Pages, Vercel, Netlify, AWS
 *      Amplify, Google Cloud Run).
 *   3. Disabled stubs show "Coming soon" with aria-disabled=true.
 *   4. Enabled-but-disconnected providers show "Not connected".
 *   5. Selecting an enabled-but-disconnected provider opens the
 *      ConnectProviderModal dialog.
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
    // /api/applications/:id — drives the ApplicationPageLoader useQuery.
    await page.route(`**/api/applications/${APP_ID}`, (route) =>
      fulfillJson(route, { application: STUB_APPLICATION })
    );

    // /api/cloud-providers — drives the DeployButton provider list.
    await page.route('**/api/cloud-providers', (route) =>
      fulfillJson(route, { providers: STUB_PROVIDERS })
    );

    // Side-routes the application page polls. Stub them so server-side
    // DI gaps in dev-web can't poison the test (e.g., unregistered
    // StreamAgentEventsUseCase causes /api/agent-events to 500).
    await page.route('**/api/applications/*/files*', (route) => fulfillJson(route, { files: [] }));
    await page.route('**/api/applications/*/cloud-deploy/status', (route) =>
      fulfillJson(route, { status: null })
    );
  });

  async function openProviderDropdown(page: Page): Promise<void> {
    const switcher = page.getByRole('button', { name: 'Switch cloud deployment provider' });
    await expect(switcher).toBeVisible({ timeout: 20000 });
    await switcher.click();
    await expect(page.getByText('Deploy to')).toBeVisible();
  }

  test('deploy button renders and provider dropdown lists all providers', async ({ page }) => {
    await page.goto(`/application/${APP_ID}`);

    // Default label is "Deploy" — no provider selected yet, status
    // NotDeployed, statusLabel() returns "Deploy".
    const deployButton = page.getByRole('button', { name: /^Deploy$/ });
    await expect(deployButton).toBeVisible({ timeout: 20000 });

    await openProviderDropdown(page);

    // Every known provider surfaces as a menu item.
    await expect(page.getByRole('menuitem', { name: /Cloudflare Pages/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Vercel/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Netlify/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /AWS Amplify/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Google Cloud Run/i })).toBeVisible();
  });

  test('stub providers show "Coming soon" and Cloudflare shows "Not connected"', async ({
    page,
  }) => {
    await page.goto(`/application/${APP_ID}`);
    await openProviderDropdown(page);

    // Cloudflare Pages is enabled but has no stored token.
    const cloudflareItem = page.getByRole('menuitem', { name: /Cloudflare Pages/i });
    await expect(cloudflareItem).toContainText(/Not connected/i);

    // Every disabled stub renders as "Coming soon" with aria-disabled=true.
    const comingSoonProviders = [/Vercel/i, /Netlify/i, /AWS Amplify/i, /Google Cloud Run/i];
    for (const label of comingSoonProviders) {
      const item = page.getByRole('menuitem', { name: label });
      await expect(item).toContainText(/Coming soon/i);
      await expect(item).toHaveAttribute('aria-disabled', 'true');
    }
  });

  test('selecting Cloudflare Pages opens the connect-provider modal', async ({ page }) => {
    await page.goto(`/application/${APP_ID}`);
    await openProviderDropdown(page);

    // Cloudflare is enabled-but-not-connected => clicking should open
    // the ConnectProviderModal (Radix Dialog).
    await page.getByRole('menuitem', { name: /Cloudflare Pages/i }).click();

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
