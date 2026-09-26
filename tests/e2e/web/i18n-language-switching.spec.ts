/**
 * E2E tests for web UI language switching.
 *
 * Verifies that selecting a non-English language in the settings page
 * immediately updates the UI text to the chosen language.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { COLD_ROUTE_READY_TIMEOUT_MS, COLD_ROUTE_TEST_TIMEOUT_MS } from './helpers/timeouts';

async function selectLanguage(page: Page, name: string) {
  const select = page.getByTestId('language-select');
  await expect(select).toBeEnabled({ timeout: COLD_ROUTE_READY_TIMEOUT_MS });
  if ((await select.textContent())?.trim() === name) return;
  await select.click();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && !!response.request().headers()['next-action']
  );
  await page.getByRole('option', { name, exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  await response.finished();
}

test.describe('i18n: language switching', () => {
  // First spec to land on /settings, so it may pay the cold route compile.
  test.describe.configure({ timeout: COLD_ROUTE_TEST_TIMEOUT_MS });

  // Language is a persisted singleton setting, so every case must restore it
  // before handing the server to another browser context or spec.
  //
  // Check the PERSISTED value, not the client: `selectLanguage` resolves on
  // the first server-action response, which can belong to another action, and
  // the client flips `html[lang]` optimistically. When the page then closed,
  // the English save was aborted mid-flight and every later spec ran in
  // Spanish. A reload renders `lang` from the stored setting, so retry the
  // selection until the server agrees.
  async function resetLanguage(page: Page) {
    await expect
      .poll(
        async () => {
          await page.goto('/settings');
          await selectLanguage(page, 'English');
          await page.reload();
          return page.getAttribute('html', 'lang');
        },
        { timeout: COLD_ROUTE_READY_TIMEOUT_MS }
      )
      .toBe('en');
  }

  test.beforeEach(async ({ page }) => resetLanguage(page));
  test.afterEach(async ({ page }) => resetLanguage(page));

  test('switching to Russian updates UI text immediately', async ({ page }) => {
    // Navigate to settings page
    await page.goto('/settings');

    // Verify English text is shown initially
    const languageTitle = page.getByTestId('language-settings-section');
    await expect(languageTitle).toBeVisible({ timeout: COLD_ROUTE_READY_TIMEOUT_MS });

    // The card title should say "Language" in English
    await expect(languageTitle.getByText('Language', { exact: true })).toBeVisible();

    await selectLanguage(page, 'Русский');

    // The card title should now say "Язык" (Russian for "Language")
    await expect(languageTitle.getByText('Язык', { exact: true })).toBeVisible();

    // The html lang attribute should be updated
    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('ru');

    // Direction should remain LTR for Russian
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('ltr');
  });

  test('switching to Arabic sets RTL direction', async ({ page }) => {
    await page.goto('/settings');

    await selectLanguage(page, 'العربية');

    // Direction should be RTL for Arabic
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');

    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('ar');
  });

  test('switching to Spanish updates navigation text', async ({ page }) => {
    await page.goto('/settings');

    await selectLanguage(page, 'Español');

    // Settings section title should be in Spanish
    const languageSection = page.getByTestId('language-settings-section');
    // "Idioma" is Spanish for "Language"
    await expect(languageSection.getByText('Idioma', { exact: true })).toBeVisible();
  });
});
