import { test, expect } from '@playwright/test';
import { expectAccessible } from './helpers/ui-accessibility';
import { enableFeatureFlag } from './helpers/feature-flag-toggle';

// These checks invoke no installed agent. Workflow coverage temporarily enables
// its feature flag through the UI and restores the previous value afterward.
test.describe('web experience regressions', () => {
  test('agent picker and search stay accessible while open', async ({ page }) => {
    await page.goto('/settings');
    const picker = page.getByRole('combobox', { name: 'Agent and model', exact: true });
    await expect(picker).toBeEnabled();
    await picker.click();
    await expect(page.getByRole('dialog', { name: 'Choose agent and model' })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Choose agent and model' })).not.toBeVisible();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog', { name: 'Search', exact: true });
    await expect(search).toBeVisible();
    await expectAccessible(page);
    await search.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(search).not.toBeVisible();
  });

  // Routes behind a default-off flag, enabled for the test and restored after.
  const ROUTE_FLAGS: Record<string, string> = {
    '/workflows': 'scheduledWorkflows',
    '/aspm/compliance': 'aspm',
  };

  for (const route of [
    '/features',
    '/tools',
    '/settings',
    '/sdlc',
    '/webhooks',
    '/onboarding',
    '/workflows',
    '/aspm/compliance',
  ]) {
    test(`${route} has no automated accessibility violations in dark mode`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('shep-theme', 'dark'));
      const flag = ROUTE_FLAGS[route];
      const restoreFlag = flag ? await enableFeatureFlag(page, flag) : null;
      try {
        await page.goto(route);
        expect(new URL(page.url()).pathname).toBe(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (route === '/settings') {
          await expect(
            page.getByRole('combobox', { name: 'Agent and model', exact: true })
          ).toBeEnabled();
        }
        await expectAccessible(page);
      } finally {
        await restoreFlag?.();
      }
    });
  }

  test('phone navigation opens and closes without losing the current page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/applications');
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Shep', exact: true });
    await expect(navigation.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navigation).not.toBeVisible();
    await expect(page).toHaveURL(/\/applications$/);
  });

  test('phone navigation closes after following a page link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/applications');
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Shep', exact: true });
    await navigation.getByRole('link', { name: 'Tools', exact: true }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(navigation).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Tools' })).toBeVisible();
  });

  test('phone navigation can expand groups even with the desktop sidebar collapsed', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'shep-sidebar-open', value: 'false', url: baseURL! }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/applications');
    await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Shep', exact: true });
    await navigation.getByRole('button', { name: 'Security', exact: true }).click();
    await navigation.getByRole('link', { name: 'Findings', exact: true }).click();
    await expect(page).toHaveURL(/\/aspm\/findings$/);
    await expect(navigation).not.toBeVisible();
  });

  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`settings stay readable and reachable at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => localStorage.setItem('shep-theme', value), theme);
        await page.goto('/settings');
        await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
        await expect(page.getByRole('main')).toHaveCount(1);
        const sections = page.getByRole('navigation', { name: 'Settings' });
        await expect(
          sections.getByRole('button', { name: 'Database', exact: true })
        ).toBeAttached();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
        await sections.getByRole('button', { name: 'Database', exact: true }).click();
        await expect(page.getByTestId('database-settings-section')).toBeInViewport();
        await sections.getByRole('button', { name: 'Language', exact: true }).click();
        await expect(page.getByTestId('language-settings-section')).toBeInViewport();
      });
    }
  }

  for (const route of ['/features', '/tools', '/webhooks']) {
    test(`${route} fits a phone and exposes named controls`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      for (const control of await page.getByRole('combobox').all()) {
        await expect(control).toHaveAccessibleName(/\S/);
      }
    });
  }

  test('tutorial sections can be identified and toggled by keyboard', async ({ page }) => {
    await page.goto('/onboarding');
    const toggles = page.locator('button[aria-controls^="steps-"]');
    await expect(toggles.first()).toBeVisible();
    for (const toggle of await toggles.all()) {
      await expect(toggle).toHaveAccessibleName(/\S/);
      const before = await toggle.getAttribute('aria-expanded');
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true');
    }
  });
});
