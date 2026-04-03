import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const TEST_FEATURE_ID = `e2e-cwp-${randomUUID().slice(0, 8)}`;

/** Compute the expected worktree path the same way the canonical computeWorktreePath does. */
function computeWorktreePath(repoPath: string, branch: string): string {
  const normalizedRepoPath = repoPath.replace(/\\/g, '/');
  const repoHash = createHash('sha256').update(normalizedRepoPath).digest('hex').slice(0, 16);
  const slug = branch.replace(/\//g, '-');
  const shepHome = process.env.SHEP_HOME ?? join(homedir(), '.shep');
  return join(shepHome, 'repos', repoHash, 'wt', slug).replace(/\\/g, '/');
}

function getDb(): Database.Database {
  const dbPath = process.env.SHEP_HOME
    ? join(process.env.SHEP_HOME, 'data')
    : join(homedir(), '.shep', 'data');
  return new Database(dbPath);
}

function seedFeature(db: Database.Database, worktreePath: string | null): void {
  const now = Date.now();
  const repo = db.prepare('SELECT id, path FROM repositories LIMIT 1').get() as
    | { id: string; path: string }
    | undefined;

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
    'E2E Copy Worktree Path',
    'e2e-copy-worktree-path',
    'Test worktree clipboard feature',
    'Test copy worktree path',
    repo?.path ?? '/tmp/e2e-test-repo',
    'feature/e2e-copy-worktree',
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
    worktreePath,
    repo?.id ?? null,
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

test.describe('Copy path copies the feature worktree path', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = getDb();
    seedFeature(db, '/explicit/worktree/path');
  });

  test.afterAll(() => {
    if (db) {
      cleanupFeature(db);
      db.close();
    }
  });

  test('Copy path copies the worktree path from database when set', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to the feature drawer
    await page.goto(`/feature/${TEST_FEATURE_ID}`);

    // Wait for the drawer to appear
    await expect(page.getByRole('heading', { name: 'E2E Copy Worktree Path' })).toBeVisible({
      timeout: 15000,
    });

    // Click "Copy path" button in the toolbar
    const actionsBar = page.getByTestId('feature-drawer-actions');
    const copyButton = actionsBar.getByRole('button', { name: 'Copy path' });
    await expect(copyButton).toBeVisible({ timeout: 5000 });
    await copyButton.click();

    // Read clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

    // Should copy the explicit worktree path from the DB, not the repositoryPath
    expect(clipboardText).toBe('/explicit/worktree/path');
  });

  test('Copy path copies computed worktree path when DB value is null', async ({
    page,
    context,
  }) => {
    // Update feature to have no worktree_path
    db.prepare('UPDATE features SET worktree_path = NULL WHERE id = ?').run(TEST_FEATURE_ID);

    // Read the actual repository_path from the seeded feature to compute expected path
    const row = db
      .prepare('SELECT repository_path FROM features WHERE id = ?')
      .get(TEST_FEATURE_ID) as { repository_path: string } | undefined;
    const actualRepoPath = row!.repository_path;
    const branch = 'feature/e2e-copy-worktree';
    const expected = computeWorktreePath(actualRepoPath, branch);

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto(`/feature/${TEST_FEATURE_ID}`);

    await expect(page.getByRole('heading', { name: 'E2E Copy Worktree Path' })).toBeVisible({
      timeout: 15000,
    });

    // Click "Copy path" button in the toolbar
    const actionsBar = page.getByTestId('feature-drawer-actions');
    const copyButton = actionsBar.getByRole('button', { name: 'Copy path' });
    await expect(copyButton).toBeVisible({ timeout: 5000 });
    await copyButton.click();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

    // Should copy the computed worktree path, not the repositoryPath
    expect(clipboardText).toBe(expected);
    // Sanity check: should NOT be the raw repository path
    expect(clipboardText).not.toBe(actualRepoPath);
  });
});
