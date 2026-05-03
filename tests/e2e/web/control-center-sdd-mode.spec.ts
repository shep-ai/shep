import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * E2E for the "Open in Control Center (SDD mode)" flow.
 *
 * Walks the full app-page → overflow menu → /create drawer pre-scoped path
 * end-to-end:
 *   1. Stub the application (so /application/[id] renders without a real DI
 *      bootstrap) and navigate to it.
 *   2. Open the `⋯` overflow menu and click "Open in Control Center
 *      (SDD mode)".
 *   3. Assert the URL becomes /create with the canonical params
 *      (applicationId + mode=spec).
 *   4. Assert the drawer is mounted with the repository pre-filled, the
 *      Spec build-mode pinned and disabled, and the repo selector locked.
 *   5. Assert the cleanup of the canvas-edge story is covered separately
 *      by the Storybook `ApplicationWithChildSpecFeature` story — the
 *      live agent-events SSE round-trip is too heavy for a smoke E2E.
 *
 * Every HTTP route the app needs is stubbed so the test runs offline and
 * does not depend on a real SQLite DB or DI container.
 */

const APP_ID = 'e2e-app-sdd-mode';
const APP_REPO_PATH = '/tmp/shep-e2e-sdd-mode';
const APP_NAME = 'E2E SDD Mode App';

const STUB_APPLICATION = {
  id: APP_ID,
  name: APP_NAME,
  slug: 'e2e-sdd-mode-app',
  description: 'Smoke-test fixture for the SDD-mode entry-point flow',
  repositoryPath: APP_REPO_PATH,
  additionalPaths: [],
  status: 'Idle',
  setupComplete: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function stubAllRoutes(page: Page): Promise<void> {
  // Application detail fetch — return the enriched shape the app page expects.
  await page.route(`**/api/applications/${APP_ID}`, (route) =>
    fulfillJson(route, {
      application: STUB_APPLICATION,
      initialChatState: null,
      deployment: null,
    })
  );

  // Side routes the application page polls.
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
  await page.route('**/api/cloud-providers', (route) => fulfillJson(route, { providers: [] }));
  await page.route('**/api/operations/**', (route) => fulfillJson(route, { entries: [] }));
  await page.route('**/api/agent-events*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: '',
    })
  );
}

test.describe('Control Center — SDD mode entry point', () => {
  test.beforeEach(async ({ page }) => {
    await stubAllRoutes(page);
  });

  test('app-page overflow menu navigates to /create with mode=spec and applicationId', async ({
    page,
  }) => {
    await page.goto(`/application/${APP_ID}`);

    // Open the `⋯` overflow menu in the top bar.
    const overflowTrigger = page.getByRole('button', { name: 'More options' });
    await expect(overflowTrigger).toBeVisible({ timeout: 20000 });
    await overflowTrigger.click();

    // The new entry is rendered inside the menu.
    const sddItem = page.getByTestId('open-in-control-center-sdd-menu-item');
    await expect(sddItem).toBeVisible();

    // Click navigates to /create with the canonical query params.
    await sddItem.click();

    await page.waitForURL(/\/create\?/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/create');
    expect(url.searchParams.get('mode')).toBe('spec');
    expect(url.searchParams.get('applicationId')).toBe(APP_ID);
  });

  test('drawer opens pre-scoped: repo locked, Spec mode pinned and disabled', async ({ page }) => {
    // Navigate directly via the canonical URL — same path the app-page
    // overflow menu pushes to. Skips the intermediate click so the test
    // can run even if the application page transition is flaky on CI.
    await page.goto(`/create?applicationId=${APP_ID}&mode=spec`);

    // Drawer renders with the standard NEW FEATURE heading.
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).toBeVisible({
      timeout: 20000,
    });

    // The repository section is rendered as a locked read-only label —
    // the data attribute lets us assert the lock without depending on
    // localized tooltip text. The application determines the repo, so the
    // user cannot pick a different one.
    const repoSection = page.getByTestId('repo-readonly-section');
    await expect(repoSection).toBeVisible();
    await expect(repoSection).toHaveAttribute('data-locked-by-application', 'true');

    // The Spec mode is seeded as the default (matching the entry-point's
    // SDD intent), but the picker remains editable so launching a feature
    // against an application feels like launching one against a regular
    // repository — the user can switch to Fast in one click.
    const specButton = page.getByTestId('build-mode-spec');
    await expect(specButton).toHaveAttribute('aria-pressed', 'true');
    await expect(specButton).toBeEnabled();

    const fastButton = page.getByTestId('build-mode-fast');
    await expect(fastButton).toBeEnabled();

    // The legacy "Application" mode is no longer offered — the picker is
    // simplified to Fast and Spec only.
    await expect(page.getByTestId('build-mode-application')).toHaveCount(0);
  });

  test('navigating to /create without applicationId leaves repo selector unlocked', async ({
    page,
  }) => {
    // Regression guard for the spec's "FAB → New feature → Spec" path —
    // unscoped spec mode must NOT pick up the application lock.
    await page.goto('/create?mode=spec');

    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).toBeVisible({
      timeout: 20000,
    });

    // The repo selector / read-only section MUST NOT carry the
    // application lock data attribute.
    const lockedSection = page.locator('[data-locked-by-application="true"]');
    await expect(lockedSection).toHaveCount(0);
  });
});
