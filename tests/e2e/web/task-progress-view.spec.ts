import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Seed feature ID — cleaned up after each test run. */
const TEST_FEATURE_ID = `e2e-tpv-${randomUUID().slice(0, 8)}`;

/** Rich plan data that exercises all task states and nested action items. */
const planData = {
  id: randomUUID(),
  overview:
    'Implement user authentication with JWT tokens, session management, and role-based access control.',
  state: 'Ready',
  requirements: [],
  artifacts: [],
  tasks: [
    {
      id: randomUUID(),
      title: 'Set up authentication middleware',
      description: 'Create Express middleware for JWT token validation and session handling',
      state: 'Done',
      branch: 'feat/auth-middleware',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [
        {
          id: randomUUID(),
          name: 'Create JWT validator',
          description: 'Implement token validation with RS256 signing',
          branch: 'feat/auth-middleware',
          dependsOn: [],
          acceptanceCriteria: [
            { id: randomUUID(), description: 'Validates RS256 signed tokens', verified: true },
            { id: randomUUID(), description: 'Returns 401 for expired tokens', verified: true },
            { id: randomUUID(), description: 'Extracts user claims from token', verified: true },
          ],
        },
        {
          id: randomUUID(),
          name: 'Add session store',
          description: 'Redis-backed session storage with TTL',
          branch: 'feat/auth-middleware',
          dependsOn: [],
          acceptanceCriteria: [
            { id: randomUUID(), description: 'Sessions stored in Redis with TTL', verified: true },
            {
              id: randomUUID(),
              description: 'Session invalidation on logout',
              verified: true,
            },
          ],
        },
      ],
    },
    {
      id: randomUUID(),
      title: 'Implement login and registration endpoints',
      description: 'REST API endpoints for user authentication flow',
      state: 'Done',
      branch: 'feat/auth-endpoints',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [
        {
          id: randomUUID(),
          name: 'POST /auth/register',
          description: 'User registration with email verification',
          branch: 'feat/auth-endpoints',
          dependsOn: [],
          acceptanceCriteria: [
            { id: randomUUID(), description: 'Validates email format', verified: true },
            { id: randomUUID(), description: 'Hashes password with bcrypt', verified: true },
            { id: randomUUID(), description: 'Sends verification email', verified: true },
          ],
        },
      ],
    },
    {
      id: randomUUID(),
      title: 'Build role-based access control',
      description: 'RBAC system with admin, editor, and viewer roles',
      state: 'Work in Progress',
      branch: 'feat/rbac',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [
        {
          id: randomUUID(),
          name: 'Define role permissions matrix',
          description: 'Map roles to allowed operations',
          branch: 'feat/rbac',
          dependsOn: [],
          acceptanceCriteria: [
            { id: randomUUID(), description: 'Admin has full access', verified: true },
            { id: randomUUID(), description: 'Editor can modify content', verified: true },
            {
              id: randomUUID(),
              description: 'Viewer restricted to read-only',
              verified: false,
            },
          ],
        },
        {
          id: randomUUID(),
          name: 'Create authorization decorator',
          description: 'Route-level permission checks',
          branch: 'feat/rbac',
          dependsOn: [],
          acceptanceCriteria: [
            {
              id: randomUUID(),
              description: 'Decorator checks role permissions',
              verified: false,
            },
            {
              id: randomUUID(),
              description: 'Returns 403 for insufficient permissions',
              verified: false,
            },
          ],
        },
      ],
    },
    {
      id: randomUUID(),
      title: 'Add password reset flow',
      description: 'Forgot password and reset token handling',
      state: 'Done',
      branch: 'feat/password-reset',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [
        {
          id: randomUUID(),
          name: 'Generate secure reset tokens',
          description: 'Time-limited tokens stored in Redis',
          branch: 'feat/password-reset',
          dependsOn: [],
          acceptanceCriteria: [
            {
              id: randomUUID(),
              description: 'Tokens expire after 15 minutes',
              verified: true,
            },
            { id: randomUUID(), description: 'One-time use tokens', verified: true },
          ],
        },
      ],
    },
    {
      id: randomUUID(),
      title: 'Implement OAuth2 social login',
      description: 'Google and GitHub OAuth2 integration',
      state: 'Todo',
      branch: 'feat/oauth',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [],
    },
    {
      id: randomUUID(),
      title: 'Write integration tests',
      description: 'End-to-end auth flow testing with test database',
      state: 'Todo',
      branch: 'feat/auth-tests',
      baseBranch: 'main',
      dependsOn: [],
      actionItems: [],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function getDb(): Database.Database {
  const dbPath = process.env.SHEP_HOME
    ? join(process.env.SHEP_HOME, 'data')
    : join(homedir(), '.shep', 'data');
  return new Database(dbPath);
}

function seedFeature(db: Database.Database): void {
  const now = Date.now();
  // Find a valid repository to attach to (use first available)
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
    'User Authentication System',
    'user-authentication-system',
    'Full authentication system with JWT, RBAC, and OAuth2 social login',
    'Add user authentication with JWT and role-based access control',
    repo?.path ?? '/tmp/e2e-test-repo',
    'feat/user-auth',
    'Implementation', // lifecycle — must map to 'implementation' for plan tab
    '[]', // messages
    JSON.stringify(planData), // plan — the rich task data
    '[]', // related_artifacts
    null, // agent_run_id — no agent run so state derives from plan tasks
    null, // spec_path
    'Regular', // mode
    0, // push
    0, // open_pr
    0, // auto_merge
    1, // allow_prd
    1, // allow_plan
    1, // allow_merge
    null, // worktree_path
    repo?.id ?? null, // repository_id
    null, // pr_url
    null, // pr_number
    null, // pr_status
    null, // commit_hash
    null, // ci_status
    null, // ci_fix_attempts
    null, // ci_fix_history
    null, // parent_id
    now, // created_at
    now // updated_at
  );
}

function cleanupFeature(db: Database.Database): void {
  db.prepare('DELETE FROM features WHERE id = ?').run(TEST_FEATURE_ID);
}

test.describe('Task Progress View — control center integration', () => {
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

  test('displays task progress view in feature drawer plan tab', async ({ page }) => {
    // Navigate to the control center
    await page.goto('/');

    // Wait for the graph to render (feature nodes should appear)
    await page.waitForTimeout(3000);

    // Navigate directly to the feature drawer via URL
    await page.goto(`/feature/${TEST_FEATURE_ID}`);

    // Wait for the drawer to appear — use heading role to target the drawer title specifically
    await expect(page.getByRole('heading', { name: 'User Authentication System' })).toBeVisible({
      timeout: 15000,
    });

    // Click the Plan tab to load task progress data
    const planTab = page.getByRole('tab', { name: 'Plan' });
    await expect(planTab).toBeVisible({ timeout: 10000 });
    await planTab.click();

    // Wait for the task progress view to render (lazy loaded)
    await expect(page.getByTestId('task-progress-view')).toBeVisible({ timeout: 10000 });

    // Verify key elements are present
    await expect(page.getByTestId('task-progress-summary')).toBeVisible();
    await expect(page.getByTestId('task-progress-bar')).toBeVisible();
    await expect(page.getByText('3 of 6 done')).toBeVisible();

    // Verify task cards for each state
    await expect(page.getByText('Set up authentication middleware')).toBeVisible();
    await expect(page.getByText('Build role-based access control')).toBeVisible();
    await expect(page.getByText('Add password reset flow')).toBeVisible();
    await expect(page.getByText('Implement OAuth2 social login')).toBeVisible();

    // Expand a task with action items (WIP task has rich details)
    const wipTask = page.getByText('Build role-based access control');
    await wipTask.click();

    // Wait for action items to expand
    await expect(page.getByText('Define role permissions matrix')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Create authorization decorator')).toBeVisible();

    // Expand the Done task too to show completed action items
    const doneTask = page.getByText('Set up authentication middleware');
    await doneTask.click();

    // Wait for done task's action items
    await expect(page.getByText('Create JWT validator')).toBeVisible({ timeout: 5000 });
  });
});
