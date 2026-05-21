/**
 * E2E: Agent editor round-trip (spec 093, task-56).
 *
 * Verifies that a user can:
 *   1. navigate to /agents and see the registered agent types,
 *   2. open /agents/feature-agent and load the tabbed editor,
 *   3. edit a prompt slot, save the override, and see the badge flip to
 *      "Overridden",
 *   4. reset the override and see the slot return to bundled.
 *
 * The whole surface is gated behind the `collaboration` feature flag — the
 * Playwright globalSetup flips it on before the dev server starts (see
 * `tests/e2e/web/global-setup.ts`).
 *
 * Local-dev caveat: if a `pnpm dev:web` server is already running when this
 * test runs, restart it once so the in-memory `Settings` cache picks up the
 * flag flip. CI starts the dev server fresh, so this is automatic there.
 */

import { test, expect } from '@playwright/test';
import type Database from 'better-sqlite3';
import { openShepDb } from './helpers/collaboration-flag';

const AGENT_TYPE = 'feature-agent';
const PROMPT_ID = 'implement.system';

function clearOverride(db: Database.Database): void {
  db.prepare('DELETE FROM agent_prompt_overrides WHERE agent_type = ? AND prompt_id = ?').run(
    AGENT_TYPE,
    PROMPT_ID
  );
}

interface OverrideRow {
  id: string;
  agent_type: string;
  prompt_id: string;
  body: string;
  version: number;
}

function readOverride(db: Database.Database): OverrideRow | undefined {
  return db
    .prepare(
      'SELECT id, agent_type, prompt_id, body, version FROM agent_prompt_overrides WHERE agent_type = ? AND prompt_id = ?'
    )
    .get(AGENT_TYPE, PROMPT_ID) as OverrideRow | undefined;
}

test.describe('Agent editor round-trip (spec 093)', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = openShepDb();
    clearOverride(db);
  });

  test.afterAll(() => {
    if (db) {
      clearOverride(db);
      db.close();
    }
  });

  test('list → open → edit → reset round-trip', async ({ page }) => {
    await page.goto('/agents');

    // If the flag is still off (e.g. local dev with a stale dev server), the
    // page returns notFound. Skip with a helpful pointer rather than failing
    // ambiguously.
    const isNotFound = await page
      .getByRole('heading', { name: 'Not Found' })
      .isVisible()
      .catch(() => false);
    test.skip(
      isNotFound,
      'Collaboration flag is OFF in the running dev server. Restart `pnpm dev:web` to pick up the globalSetup flip.'
    );

    // Agents list renders the feature-agent row.
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
    const row = page.getByTestId(`agent-row-${AGENT_TYPE}`);
    await expect(row).toBeVisible();

    // Click into the editor. Use waitForURL (30s navigation timeout) instead
    // of toHaveURL (5s expect timeout) — Next.js dev mode compiles the
    // /agents/[agentType] route on first hit, and the router holds the URL on
    // /agents until the RSC payload returns, which can exceed 5s under load.
    await row.getByRole('link', { name: /edit/i }).click();
    await page.waitForURL(`/agents/${AGENT_TYPE}`);
    await expect(page.getByTestId('agent-editor-tabs')).toBeVisible();

    // Prompts tab is the default — the implement.system slot must be visible
    // and currently bundled (no override).
    const slot = page.getByTestId(`prompt-slot-${PROMPT_ID}`);
    await expect(slot).toBeVisible();
    await expect(slot.getByTestId(`badge-overridden-${PROMPT_ID}`)).toHaveCount(0);

    // Edit the body.
    const newBody = 'E2E override body — feature-agent implement.system';
    const textarea = slot.getByTestId(`prompt-textarea-${PROMPT_ID}`);
    await textarea.fill(newBody);

    // Save the override.
    await slot.getByTestId(`prompt-save-${PROMPT_ID}`).click();
    await expect(slot.getByTestId(`prompt-saved-${PROMPT_ID}`)).toBeVisible({ timeout: 10000 });

    // Badge flips to "Overridden" and the row persists in the DB.
    await expect(slot.getByTestId(`badge-overridden-${PROMPT_ID}`)).toBeVisible();
    const persisted = readOverride(db);
    expect(persisted).toBeDefined();
    expect(persisted?.body).toBe(newBody);

    // Reload — the override hydrates back from the DB.
    await page.reload();
    const slotAfterReload = page.getByTestId(`prompt-slot-${PROMPT_ID}`);
    await expect(slotAfterReload.getByTestId(`badge-overridden-${PROMPT_ID}`)).toBeVisible();
    await expect(slotAfterReload.getByTestId(`prompt-textarea-${PROMPT_ID}`)).toHaveValue(newBody);

    // Reset to bundled.
    await slotAfterReload.getByTestId(`prompt-reset-${PROMPT_ID}`).click();
    await expect(slotAfterReload.getByTestId(`prompt-saved-${PROMPT_ID}`)).toBeVisible({
      timeout: 10000,
    });

    // DB row gone, badge gone.
    expect(readOverride(db)).toBeUndefined();
    await expect(slotAfterReload.getByTestId(`badge-overridden-${PROMPT_ID}`)).toHaveCount(0);
  });
});
