/**
 * E2E: reasoning effort settings.
 *
 * Sets the default effort in Settings > Agent, verifies it survives a reload
 * (persisted through SetDefaultEffortUseCase to SQLite), clears it back to the
 * agent default, and checks the per-feature override in the create drawer.
 */

import { test, expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { COLD_ROUTE_READY_TIMEOUT_MS, COLD_ROUTE_TEST_TIMEOUT_MS } from './helpers/timeouts';

function dbPath(): string {
  return process.env.SHEP_HOME
    ? join(process.env.SHEP_HOME, 'data')
    : join(homedir(), '.shep', 'data');
}

async function pickEffort(page: Page, testId: string, option: string): Promise<void> {
  const trigger = page.getByTestId(testId);
  await trigger.click();
  await page.getByTestId(`${testId}-option-${option}`).click();
  // The control disables itself while the save is in flight.
  await expect(trigger).toBeEnabled();
}

test.describe('effort settings', () => {
  test.describe.configure({ timeout: COLD_ROUTE_TEST_TIMEOUT_MS, mode: 'serial' });

  test.afterAll(() => {
    // Leave the shared database as we found it (agent default) even if a step failed.
    try {
      const db = new Database(dbPath());
      db.prepare('UPDATE settings SET model_effort = NULL').run();
      db.close();
    } catch {
      // The server owns the database; a missing file means nothing to restore.
    }
  });

  test('sets, persists and clears the default effort', async ({ page }) => {
    await page.goto('/settings');

    const trigger = page.getByTestId('agent-effort-select');
    await expect(trigger).toBeVisible({ timeout: COLD_ROUTE_READY_TIMEOUT_MS });
    await trigger.scrollIntoViewIfNeeded();

    await pickEffort(page, 'agent-effort-select', 'high');
    await expect(trigger).toHaveText('High');

    await page.reload();
    await expect(page.getByTestId('agent-effort-select')).toHaveText('High', {
      timeout: COLD_ROUTE_READY_TIMEOUT_MS,
    });

    await pickEffort(page, 'agent-effort-select', 'default');
    await expect(page.getByTestId('agent-effort-select')).toHaveText('Agent default');

    await page.reload();
    await expect(page.getByTestId('agent-effort-select')).toHaveText('Agent default', {
      timeout: COLD_ROUTE_READY_TIMEOUT_MS,
    });
  });

  test('offers a per-feature effort override in the create drawer', async ({ page }) => {
    await page.goto('/create');
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).toBeVisible({
      timeout: COLD_ROUTE_READY_TIMEOUT_MS,
    });

    const trigger = page.getByTestId('create-drawer-effort-select');
    await expect(trigger).toHaveText('From settings');

    await trigger.click();
    for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
      await expect(page.getByTestId(`create-drawer-effort-select-option-${level}`)).toBeVisible();
    }
    await page.getByTestId('create-drawer-effort-select-option-xhigh').click();
    await expect(trigger).toHaveText('Extra high');
  });
});
