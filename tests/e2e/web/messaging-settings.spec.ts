/**
 * E2E: Messaging remote control settings section.
 *
 * Exercises the Telegram/WhatsApp pairing flow in the web UI against a
 * real Next.js dev server. The pairing code is generated server-side by
 * BeginMessagingPairingUseCase and persisted in settings, so we do not
 * need to stub any network calls.
 */

import { test, expect } from '@playwright/test';

test.describe('messaging settings', () => {
  test('enables messaging, sets gateway URL, pairs telegram, then disconnects', async ({
    page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('messaging-settings-section');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    // Master toggle: turn messaging on
    const enableSwitch = page.getByTestId('switch-messaging-enabled');
    if ((await enableSwitch.getAttribute('data-state')) !== 'checked') {
      await enableSwitch.click();
    }

    // Gateway URL
    const gatewayInput = page.getByTestId('input-gateway-url');
    await gatewayInput.fill('https://gateway.example.com');
    await gatewayInput.blur();

    // Start Telegram pairing
    await page.getByTestId('btn-telegram-pair').click();

    const dialog = page.getByTestId('messaging-pairing-dialog');
    await expect(dialog).toBeVisible();

    // Code box should contain a 6-digit number
    const codeBox = page.getByTestId('pairing-code-box');
    await expect(codeBox).toBeVisible();
    const codeText = (await codeBox.textContent())?.trim() ?? '';
    expect(codeText).toMatch(/\d{6}/);

    // Public URL box should be visible and point into the gateway
    await expect(page.getByTestId('pairing-public-url-box')).toBeVisible();
    const publicUrl = (await page.getByTestId('pairing-public-url').textContent()) ?? '';
    expect(publicUrl).toMatch(/\/integrations\//);

    // Confirm button is disabled until chat id is typed
    const confirmBtn = page.getByTestId('btn-confirm-pairing');
    await expect(confirmBtn).toBeDisabled();

    await page.getByTestId('input-pairing-chat-id').fill('@e2e-tester');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Dialog closes after successful confirm
    await expect(dialog).toBeHidden();

    // Telegram row now shows a disconnect button
    await expect(page.getByTestId('btn-telegram-disconnect')).toBeVisible();
    await expect(page.getByTestId('btn-disconnect-all')).toBeVisible();

    // Disconnect all — row should flip back to Pair button
    await page.getByTestId('btn-disconnect-all').click();
    await expect(page.getByTestId('btn-telegram-pair')).toBeVisible();
    await expect(page.getByTestId('btn-disconnect-all')).toBeHidden();
  });

  test('refuses to begin pairing with an invalid gateway URL', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    const section = page.getByTestId('messaging-settings-section');
    await section.scrollIntoViewIfNeeded();

    const enableSwitch = page.getByTestId('switch-messaging-enabled');
    if ((await enableSwitch.getAttribute('data-state')) !== 'checked') {
      await enableSwitch.click();
    }

    await page.getByTestId('input-gateway-url').fill('not a url');
    // Don't blur (would trigger a save error toast) — click pair directly
    await page.getByTestId('btn-telegram-pair').click();

    // The pairing dialog should NOT appear
    await expect(page.getByTestId('messaging-pairing-dialog')).toBeHidden();
  });
});
