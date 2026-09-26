import { expect, test } from '@playwright/test';

/**
 * Issue 896: users took the App Builder (Vite + shadcn, no spec phase) for
 * Shep's stack-agnostic, spec-driven workflow. These journeys pin the
 * surfaces that now tell them apart. No project is created — nothing is
 * submitted, and the only navigation is the existing-folder hand-off URL.
 */

const applications = [
  {
    id: 'sdd-vs-app-builder-fixture',
    name: 'Weather Dashboard',
    description: 'Forecasts',
    slug: 'weather-dashboard',
    repositoryPath: '/projects/weather-dashboard',
    agentType: 'dev',
    status: 'Idle',
    setupComplete: true,
    effectiveStatus: 'ready',
    createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/applications', (route) => route.fulfill({ json: applications }));
});

test('the sidebar leads with Control Center and names the App Builder', async ({ page }) => {
  await page.goto('/applications');

  const nav = page.locator('[data-sidebar="sidebar"]');
  const controlCenter = nav.getByRole('link', { name: 'Control Center' });
  const appBuilder = nav.getByRole('link', { name: 'App Builder' });
  await expect(controlCenter).toBeVisible();
  await expect(appBuilder).toBeVisible();

  const [ccTop, abTop] = await Promise.all([
    controlCenter.boundingBox().then((box) => box!.y),
    appBuilder.boundingBox().then((box) => box!.y),
  ]);
  expect(ccTop, 'Control Center is listed above the App Builder').toBeLessThan(abTop);
});

test('the App Builder states its stack and offers the spec-driven path', async ({ page }) => {
  await page.goto('/applications');

  await expect(page.getByRole('heading', { level: 1, name: 'App Builder' })).toBeVisible();
  await expect(page.getByTestId('app-builder-intro')).toContainText(
    'Vite + React + Tailwind + shadcn'
  );
  await expect(page.getByTestId('new-application-option-quick-web-app')).toContainText(
    'Vite + React + shadcn'
  );
  await expect(page.getByTestId('new-application-option-spec-driven-project')).toContainText(
    'Any stack'
  );
  await expect(page.getByText('Describe with AI')).toHaveCount(0);
});

test('a spec-driven project opens in Spec-driven mode and hands existing folders off', async ({
  page,
}) => {
  await page.goto('/applications');
  await page.getByTestId('new-application-option-spec-driven-project').click();

  await expect(page.getByTestId('build-mode-selector')).toContainText('Spec-driven');
  await expect(page.getByTestId('build-mode-description')).toContainText(
    'Any stack, chosen during research'
  );

  const prompt = 'look at /home/alex/code/trainer and plan in docs folder';
  await page.getByRole('textbox', { name: 'Describe what you want to build' }).fill(prompt);
  await expect(page.getByTestId('existing-code-hint')).toContainText('/home/alex/code/trainer');

  await page.getByRole('button', { name: 'Work on this folder instead' }).click();
  await page.waitForURL(/\/create\?/);

  const url = new URL(page.url());
  expect(url.searchParams.get('repo')).toBe('/home/alex/code/trainer');
  expect(url.searchParams.get('mode')).toBe('spec');
  expect(url.searchParams.get('prompt')).toBe(prompt);
});

test('Quick web app mode names its Vite + shadcn stack', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('new-application-option-quick-web-app').click();

  await expect(page.getByTestId('build-mode-selector')).toContainText('Quick web app');
  await expect(page.getByTestId('build-mode-description')).toContainText(
    'Vite + React + Tailwind + shadcn'
  );
});
