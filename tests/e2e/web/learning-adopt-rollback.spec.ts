/**
 * E2E: adopt and roll back a learned-harness version from the Learning page
 * (spec 150, task-22).
 *
 * Seeds an adopted version and a candidate built on it for a repository path
 * of its own, turns the selfLearning flag on from Settings, then:
 *   1. the Learning page opens on the candidate (it needs a decision);
 *   2. Adopt makes the candidate current and supersedes the old version;
 *   3. Roll back (confirmed) marks the candidate rolled back and restores
 *      the version it was built on.
 * Each step is checked in the page and in the SQLite rows.
 */

import { test, expect } from '@playwright/test';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { openShepDb } from './helpers/collaboration-flag';
import { enableFeatureFlag } from './helpers/feature-flag-toggle';

const RUN = randomUUID().slice(0, 8);
const REPO = `/e2e/learning-${RUN}`;
const BASE_ID = `e2e${RUN}-base`;
const CANDIDATE_ID = `e2f${RUN}-cand`;

const component = (path: string, content: string, kind: string) => ({
  kind,
  path,
  content,
  sha256: path,
});

function seed(db: Database.Database): void {
  const insert = db.prepare(
    `INSERT INTO learned_harness_versions
       (id, scope, repository_path, parent_version_id, status, origin, components,
        notes, created_at, updated_at)
     VALUES (?, 'Project', ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  insert.run(
    BASE_ID,
    REPO,
    null,
    'adopted',
    'manual',
    JSON.stringify([component('guardrails.md', 'Run the tests.', 'guardrails')]),
    'Seeded by e2e',
    now - 2000,
    now - 2000
  );
  insert.run(
    CANDIDATE_ID,
    REPO,
    BASE_ID,
    'candidate',
    'reflect',
    JSON.stringify([
      component('guardrails.md', 'Run the tests.', 'guardrails'),
      component('tool-guidance.md', 'Use pnpm, never npm.', 'tool-guidance'),
    ]),
    'Seeded candidate',
    now - 1000,
    now - 1000
  );
}

function statusOf(db: Database.Database, id: string): string {
  return (
    db.prepare('SELECT status FROM learned_harness_versions WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;
}

test.describe('Learning page', () => {
  let db: Database.Database;

  test.beforeAll(() => {
    db = openShepDb();
    seed(db);
  });

  test.afterAll(() => {
    db.prepare('DELETE FROM learned_harness_versions WHERE repository_path = ?').run(REPO);
    db.close();
  });

  test('adopts a candidate and rolls it back', async ({ page }) => {
    const restoreFlag = await enableFeatureFlag(page, 'selfLearning');
    try {
      await page.goto(`/learning?repo=${encodeURIComponent(REPO)}`);
      const detail = page.getByTestId('harness-version-detail');
      await expect(detail).toContainText(CANDIDATE_ID.slice(0, 8));
      await expect(page.getByTestId('learning-current')).toContainText(BASE_ID.slice(0, 8));

      await page.getByTestId('harness-adopt').click();
      await expect(page.getByTestId('learning-current')).toContainText(CANDIDATE_ID.slice(0, 8));
      expect(statusOf(db, CANDIDATE_ID)).toBe('adopted');
      expect(statusOf(db, BASE_ID)).toBe('superseded');

      await page.getByTestId('learning-rollback').click();
      await page.getByTestId('learning-rollback-confirm').click();
      await expect(page.getByTestId('learning-current')).toContainText(BASE_ID.slice(0, 8));
      expect(statusOf(db, CANDIDATE_ID)).toBe('rolled-back');
      expect(statusOf(db, BASE_ID)).toBe('adopted');
    } finally {
      await restoreFlag();
    }
  });
});
