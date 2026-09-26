import { expect, test } from '@playwright/test';

/**
 * Issue 896: "start an app, then add features". Apps are started either by
 * planning them first on any stack (spec-driven) or from the Vite + shadcn
 * prototype template, and each option says which. No project is created —
 * nothing is submitted, and the only navigation is the existing-folder
 * hand-off URL.
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

test('the sidebar leads with Control Center, then Apps', async ({ page }) => {
  await page.goto('/applications');

  const nav = page.locator('[data-sidebar="sidebar"]');
  const controlCenter = nav.getByRole('link', { name: 'Control Center' });
  const apps = nav.getByRole('link', { name: 'Apps', exact: true });
  await expect(controlCenter).toBeVisible();
  await expect(apps).toBeVisible();

  const [ccTop, abTop] = await Promise.all([
    controlCenter.boundingBox().then((box) => box!.y),
    apps.boundingBox().then((box) => box!.y),
  ]);
  expect(ccTop, 'Control Center is listed above Apps').toBeLessThan(abTop);
});

test('Apps says "start an app, then add features" and names both starters', async ({ page }) => {
  await page.goto('/applications');

  await expect(page.getByRole('heading', { level: 1, name: 'Apps' })).toBeVisible();
  const intro = page.getByTestId('apps-intro');
  await expect(intro).toContainText('Start an app, then add features');
  await expect(intro).toContainText('Vite + React + Tailwind + shadcn');
  await expect(page.getByTestId('new-application-option-plan-first')).toContainText('Any stack');
  await expect(page.getByTestId('new-application-option-quick-prototype')).toContainText(
    'Vite + React + shadcn'
  );
  await expect(page.getByText('Describe with AI')).toHaveCount(0);
});

test('"Plan it first" opens in Spec-driven mode and hands existing folders off', async ({
  page,
}) => {
  await page.goto('/applications');
  await page.getByTestId('new-application-option-plan-first').click();

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

test('Quick prototype mode names its Vite + shadcn stack', async ({ page }) => {
  await page.goto('/applications');
  await page.getByTestId('new-application-option-quick-prototype').click();

  await expect(page.getByTestId('build-mode-selector')).toContainText('Quick prototype');
  await expect(page.getByTestId('build-mode-description')).toContainText(
    'Vite + React + Tailwind + shadcn'
  );
});

test('"New app" plans the app first by default', async ({ page }) => {
  await page.goto('/applications');
  await page.getByRole('button', { name: 'New app' }).click();

  await expect(page.getByTestId('build-mode-selector')).toContainText('Spec-driven');
  await expect(page.getByTestId('build-mode-description')).toContainText(
    'Any stack, chosen during research'
  );
});
