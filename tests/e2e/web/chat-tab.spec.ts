/**
 * E2E tests for the Chat tab interactive agent flow.
 *
 * All interactive session API endpoints are mocked via page.route() so
 * no real agent process is spawned during testing. The SSE stream endpoint
 * is mocked to return a single delta + done event pair.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TEST_FEATURE_ID = `e2e-chat-${randomUUID().slice(0, 8)}`;
const TEST_SESSION_ID = `sess-${randomUUID().slice(0, 8)}`;

function getDb(): Database.Database {
  const dbPath = process.env.SHEP_HOME
    ? join(process.env.SHEP_HOME, 'data')
    : join(homedir(), '.shep', 'data');
  return new Database(dbPath);
}

function seedFeature(db: Database.Database): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO features (
      id, name, slug, description, user_query, repository_path, branch,
      lifecycle, messages, plan, related_artifacts, agent_run_id, spec_path,
      mode, push, open_pr, auto_merge, allow_prd, allow_plan, allow_merge,
      worktree_path, repository_id, pr_url, pr_number, pr_status,
      commit_hash, ci_status, ci_fix_attempts, ci_fix_history,
      parent_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )`
  ).run(
    TEST_FEATURE_ID,
    'E2E Chat Test Feature',
    'e2e-chat-test',
    'Test interactive chat feature',
    'Test interactive chat',
    '/tmp/e2e-chat-repo',
    'feature/e2e-chat-test',
    'Implementation',
    '[]',
    null,
    '[]',
    null,
    null,
    'Regular',
    0,
    0,
    0,
    1,
    1,
    1,
    '/tmp/e2e-chat-worktree',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    now,
    now
  );
}

function cleanupFeature(db: Database.Database): void {
  db.prepare('DELETE FROM features WHERE id = ?').run(TEST_FEATURE_ID);
}

/** Mock all feature-scoped chat API endpoints on the given page. */
async function mockChatApis(page: Page): Promise<void> {
  let messages: {
    id: string;
    featureId: string;
    role: string;
    content: string;
    createdAt: string;
    updatedAt: string;
  }[] = [];

  let sessionActive = false;

  // GET + POST + DELETE /api/interactive/chat/:featureId/messages
  await page.route(`**/api/interactive/chat/${TEST_FEATURE_ID}/messages`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          messages,
          sessionStatus: sessionActive ? 'ready' : null,
          streamingText: null,
          sessionInfo: sessionActive
            ? {
                pid: 12345,
                sessionId: TEST_SESSION_ID,
                model: 'claude-sonnet-4-6',
                startedAt: new Date().toISOString(),
                idleTimeoutMinutes: 30,
                lastActivityAt: new Date().toISOString(),
              }
            : null,
        }),
      });
    }
    // POST — send user message (auto-starts session)
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { content: string };
      sessionActive = true;
      const userMsg = {
        id: `msg-user-${Date.now()}`,
        featureId: TEST_FEATURE_ID,
        role: 'user',
        content: body.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const assistantMsg = {
        id: `msg-response-${Date.now()}`,
        featureId: TEST_FEATURE_ID,
        role: 'assistant',
        content: 'I can help you with that feature.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      messages = [...messages, userMsg, assistantMsg];
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: userMsg }),
      });
    }
    // DELETE — clear chat
    if (route.request().method() === 'DELETE') {
      messages = [];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });

  // POST /api/interactive/chat/:featureId/stop — stop agent
  await page.route(`**/api/interactive/chat/${TEST_FEATURE_ID}/stop`, (route) => {
    if (route.request().method() === 'POST') {
      sessionActive = false;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
    return route.continue();
  });

  // GET /api/interactive/chat/:featureId/stream — SSE
  await page.route(`**/api/interactive/chat/${TEST_FEATURE_ID}/stream`, (route) => {
    const sseBody = [
      `: connected\n\n`,
      `event: delta\ndata: {"delta":"I can help you with that feature.","featureId":"${TEST_FEATURE_ID}"}\n\n`,
      `event: done\ndata: {"done":true,"featureId":"${TEST_FEATURE_ID}"}\n\n`,
    ].join('');
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: sseBody,
    });
  });
}

test.describe('Chat tab — interactive agent flow', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = getDb();
    seedFeature(db);
  });

  test.afterAll(() => {
    if (db) {
      cleanupFeature(db);
      db.close();
    }
  });

  test('full happy-path: open chat tab → send message → stop', async ({ page }) => {
    await mockChatApis(page);

    // Also mock the feature API so we don't depend on server-side feature loading
    // which can fail if another test's seeded repo has an invalid path
    await page.route(`**/api/features/${TEST_FEATURE_ID}`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: TEST_FEATURE_ID,
          name: 'E2E Chat Test Feature',
          slug: 'e2e-chat-test',
          description: 'Test interactive chat feature',
          lifecycle: 'Implementation',
          branch: 'feature/e2e-chat-test',
          worktreePath: '/tmp/e2e-chat-worktree',
          repositoryPath: '/tmp/e2e-chat-repo',
          messages: [],
          relatedArtifacts: [],
          mode: 'Regular',
          push: false,
          openPr: false,
          autoMerge: false,
          allowPrd: true,
          allowPlan: true,
          allowMerge: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      });
    });

    // Navigate to the feature detail page
    await page.goto(`/feature/${TEST_FEATURE_ID}`);

    // Wait for the drawer heading
    await expect(page.getByRole('heading', { name: 'E2E Chat Test Feature' })).toBeVisible({
      timeout: 15_000,
    });

    // Click the Chat tab
    const chatTabButton = page.getByRole('tab', { name: /chat/i });
    await expect(chatTabButton).toBeVisible({ timeout: 5_000 });
    await chatTabButton.click();

    // Empty state: chat input should be immediately visible (no start button needed)
    const chatInput = page.getByRole('textbox', { name: /message|write/i });
    await expect(chatInput).toBeVisible({ timeout: 5_000 });

    // Empty state text should be shown
    await expect(page.getByText('Send a message to start chatting with the agent.')).toBeVisible({
      timeout: 5_000,
    });

    // Type a message using keyboard events to trigger React state updates properly
    await chatInput.click();
    await chatInput.pressSequentially('Hello agent', { delay: 20 });
    await chatInput.press('Enter');

    // User message should appear (either optimistically or after refetch)
    await expect(page.getByText('Hello agent')).toBeVisible({ timeout: 10_000 });

    // Stop button should be visible in the header when session is active
    const stopButton = page.getByRole('button', { name: /stop/i });
    await expect(stopButton).toBeVisible({ timeout: 5_000 });
    await stopButton.click();

    // After stop: Clear button should still be visible, chat input should remain usable
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible({ timeout: 5_000 });
    await expect(chatInput).toBeVisible();
  });
});

test.describe('Chat tab — hidden when interactive agent is disabled', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = getDb();
    // Feature should already exist from the other describe block,
    // but seed again in case tests run independently
    try {
      seedFeature(db);
    } catch {
      // Already exists — OK
    }
  });

  test.afterAll(() => {
    if (db) {
      // Restore settings in case test left them disabled
      try {
        db.prepare(`UPDATE settings SET interactive_agent_enabled = 1 WHERE 1=1`).run();
      } catch {
        // Column may not exist — OK
      }
      cleanupFeature(db);
      db.close();
    }
  });

  test('Chat tab is absent when interactiveAgent.enabled = false in settings', async ({ page }) => {
    // Navigate to settings page and disable interactive agent via the UI toggle.
    // This updates both the DB and the in-memory settings singleton on the server.
    await page.goto('/settings');

    // Wait for settings page to load
    const section = page.getByTestId('interactive-agent-settings-section');
    await expect(section).toBeVisible({ timeout: 15_000 });

    // Scroll to the interactive agent section
    await section.scrollIntoViewIfNeeded();

    // Find the enable switch and turn it off
    const enableSwitch = page.getByTestId('switch-interactive-agent-enabled');
    await expect(enableSwitch).toBeVisible({ timeout: 5_000 });

    // Check if it's currently checked (enabled) and click to disable
    const isChecked = await enableSwitch.getAttribute('data-state');
    if (isChecked === 'checked') {
      await enableSwitch.click();
      // Wait for the save to complete
      await page.waitForTimeout(500);
    }

    // Now navigate to the feature detail page
    await page.goto(`/feature/${TEST_FEATURE_ID}`);

    // Wait for the drawer heading
    await expect(page.getByRole('heading', { name: 'E2E Chat Test Feature' })).toBeVisible({
      timeout: 15_000,
    });

    // Chat tab should NOT be present in the tab bar
    const chatTabButton = page.getByRole('tab', { name: /^chat$/i });
    await expect(chatTabButton).not.toBeVisible({ timeout: 3_000 });

    // Re-enable interactive agent for subsequent tests
    await page.goto('/settings');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await section.scrollIntoViewIfNeeded();
    const switchAfter = page.getByTestId('switch-interactive-agent-enabled');
    const stateAfter = await switchAfter.getAttribute('data-state');
    if (stateAfter === 'unchecked') {
      await switchAfter.click();
      await page.waitForTimeout(500);
    }
  });
});
