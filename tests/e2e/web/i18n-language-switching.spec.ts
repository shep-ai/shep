/**
 * E2E tests for web UI language switching.
 *
 * Verifies that selecting a non-English language in the settings page
 * immediately updates the UI text to the chosen language.
 */

import { test, expect } from '@playwright/test';

test.describe('i18n: language switching', () => {
  test('switching to Russian updates UI text immediately', async ({ page }) => {
    // Navigate to settings page
    await page.goto('/settings');

    // Verify the language settings section is visible
    const languageTitle = page.getByTestId('language-settings-section');
    await expect(languageTitle).toBeVisible();

    // Open the language select dropdown
    const languageSelect = page.getByTestId('language-select');
    await languageSelect.click();

    // Select Russian
    await page.getByRole('option', { name: 'Русский' }).click();

    // Wait a moment for i18n to update
    await page.waitForTimeout(500);

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

    const languageSelect = page.getByTestId('language-select');
    await expect(languageSelect).toBeVisible();
    await languageSelect.click();

    await page.getByRole('option', { name: 'العربية' }).click();
    await page.waitForTimeout(500);

    // Direction should be RTL for Arabic
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');

    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('ar');
  });

  test('switching to Spanish updates navigation text', async ({ page }) => {
    await page.goto('/settings');

    const languageSelect = page.getByTestId('language-select');
    await expect(languageSelect).toBeVisible();
    await languageSelect.click();

    await page.getByRole('option', { name: 'Español' }).click();
    await page.waitForTimeout(500);

    // Settings section title should be in Spanish
    const languageSection = page.getByTestId('language-settings-section');
    // "Idioma" is Spanish for "Language"
    await expect(languageSection.getByText('Idioma', { exact: true })).toBeVisible();
  });
});
