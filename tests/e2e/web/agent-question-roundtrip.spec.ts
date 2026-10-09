/**
 * E2E: Blocking AgentQuestion answer round-trip (spec 093, task-47).
 *
 * Seeds a blocking AgentQuestion (mirroring what AskAgentQuestionUseCase
 * persists in production) and verifies the answer round-trip via the unified
 * inbox at /agent-questions:
 *
 *   1. The blocking question renders in the inbox within the SSE poll
 *      window (NFR-10 budget — the page server-loads pending questions on
 *      navigation so the user sees it immediately, well under 2s).
 *   2. A user types an answer and submits it.
 *   3. The agent_questions row transitions pending → answered.
 *   4. The UI reflects the answered state.
 *
 * The supervisor remains silent during the test (no SupervisorPolicy is
 * configured for the seeded app, so the StubSupervisorAgentExecutor / live
 * supervisor never engages).
 *
 * The notification + activity_log fan-out triggered by
 * EscalateToUserUseCase is covered separately by unit / integration tests
 * (see `tests/unit/.../escalate-to-user.use-case.test.ts`).
 *
 * Local-dev caveat: the `collaboration` feature flag is flipped by global
 * setup before the dev server boots. If a dev server was already running,
 * restart `pnpm dev:web` once before running this spec.
 */

import { test, expect } from '@playwright/test';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { openShepDb } from './helpers/collaboration-flag';

const TEST_APP_ID = `e2e-app-question-${randomUUID().slice(0, 8)}`;
const TEST_FEATURE_ID = `e2e-feat-question-${randomUUID().slice(0, 8)}`;
const TEST_RUN_ID = `e2e-run-question-${randomUUID().slice(0, 8)}`;
const TEST_QUESTION_ID = `e2e-q-${randomUUID().slice(0, 8)}`;
const TEST_PROMPT = `E2E blocking question prompt — should we proceed? (${randomUUID().slice(0, 4)})`;

interface QuestionRow {
  id: string;
  status: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: number | null;
}

function seedQuestion(db: Database.Database): void {
  const now = Date.now();

  db.prepare(
    `INSERT OR REPLACE INTO agent_runs (
      id, agent_type, agent_name, status, prompt, thread_id,
      feature_id, repository_path,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    TEST_RUN_ID,
    'feature',
    'e2e-question-feature',
    'waiting_approval',
    'E2E seeded prompt',
    `thread-${TEST_RUN_ID}`,
    TEST_FEATURE_ID,
    '/tmp/e2e-test-repo',
    now,
    now
  );

  db.prepare(
    `INSERT OR REPLACE INTO agent_questions (
      id, app_id, feature_id, agent_run_id, kind, prompt,
      options_json, default_answer, answerer, status,
      answer, answered_by, answered_at, expires_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    TEST_QUESTION_ID,
    TEST_APP_ID,
    TEST_FEATURE_ID,
    TEST_RUN_ID,
    'blocking',
    TEST_PROMPT,
    null,
    null,
    'user',
    'pending',
    null,
    null,
    null,
    null,
    now,
    now
  );
}

function readQuestion(db: Database.Database): QuestionRow | undefined {
  return db
    .prepare(
      'SELECT id, status, answer, answered_by, answered_at FROM agent_questions WHERE id = ?'
    )
    .get(TEST_QUESTION_ID) as QuestionRow | undefined;
}

function cleanup(db: Database.Database): void {
  db.prepare('DELETE FROM agent_questions WHERE id = ?').run(TEST_QUESTION_ID);
  db.prepare('DELETE FROM agent_runs WHERE id = ?').run(TEST_RUN_ID);
}

test.describe('Agent question round-trip — answer a blocking question (spec 093)', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = openShepDb();
    cleanup(db);
    seedQuestion(db);
  });

  test.afterAll(() => {
    if (db) {
      cleanup(db);
      db.close();
    }
  });

  test('blocking question appears in the inbox, answer transitions it to answered', async ({
    page,
  }) => {
    // Verify the seed (so a later assertion failure isn't caused by a missing row).
    const seeded = readQuestion(db);
    expect(seeded?.status).toBe('pending');

    await page.goto(`/agent-questions?app=${TEST_APP_ID}&status=pending`);

    // Skip cleanly if the flag didn't take effect on a stale dev server.
    const isNotFound = await page
      .getByRole('heading', { name: 'Not Found' })
      .isVisible()
      .catch(() => false);
    test.skip(
      isNotFound,
      'Collaboration flag is OFF in the running dev server. Restart `pnpm dev:web` to pick up the globalSetup flip.'
    );

    await expect(page.getByRole('heading', { name: 'Agent questions' })).toBeVisible();
    await expect(page.getByTestId('agent-questions-inbox')).toBeVisible();

    // The seeded question is rendered through the decision panel (spec 134).
    const row = page.getByTestId(`question-row-${TEST_QUESTION_ID}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(TEST_PROMPT);

    // Type an answer and submit.
    const answerInput = row.getByTestId('decision-panel-other-input');
    await expect(answerInput).toBeVisible();
    await answerInput.fill('proceed');

    await row.getByTestId('decision-panel-submit').click();

    // The status filter is "pending" — once answered the question is filtered
    // out. Switch to "All" so the answered row remains visible.
    await page.getByTestId('status-filter').click();
    await page.getByRole('option', { name: 'All' }).click();

    // The row reflects the answered state inline.
    await expect(page.getByTestId(`question-answer-${TEST_QUESTION_ID}`)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId(`question-answer-${TEST_QUESTION_ID}`)).toContainText('proceed');

    // Persistence: the DB row transitioned pending → answered.
    const updated = readQuestion(db);
    expect(updated?.status).toBe('answered');
    expect(updated?.answer).toBe('proceed');
    expect(updated?.answered_by).toBe('user:web');
    expect(updated?.answered_at).not.toBeNull();
  });
});
