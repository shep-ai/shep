import { expect, type Page } from '@playwright/test';

/**
 * Turns a feature flag on from the Settings page and returns a function that
 * turns it back off (a no-op when the flag was already on).
 *
 * The dev server caches Settings in memory, so writing the SQLite row after
 * boot does not reach it; the Settings toggle updates the live process.
 */
export async function enableFeatureFlag(page: Page, flag: string): Promise<() => Promise<void>> {
  await page.goto('/settings');
  const toggle = page.getByTestId(`switch-flag-${flag}`);
  await expect(toggle).toBeEnabled();
  if ((await toggle.getAttribute('data-state')) === 'checked') {
    return async () => undefined;
  }
  await toggle.click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  return async () => {
    await page.goto('/settings');
    await page.getByTestId(`switch-flag-${flag}`).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  };
}
