import { openShepDb, setCollaborationFlag } from './helpers/collaboration-flag';
import { seedOptimisticClickFeature } from './helpers/feature-fixtures';

/**
 * Playwright global setup: flips the `collaboration` feature flag on in the
 * Shep SQLite database BEFORE Playwright starts the dev:web server.
 *
 * This is the only reliable way to enable a flag for end-to-end tests on a
 * cold-boot dev server — the `Settings` singleton is loaded once at startup
 * and cached in-process, so DB writes after the server is running do not
 * propagate.
 *
 * Existing e2e tests are unaffected: they don't navigate to the
 * collaboration-gated routes (`/agent-questions`, `/application/:id/supervisor`),
 * and the flag enables additive code paths only.
 */
export default async function globalSetup(): Promise<void> {
  let db: ReturnType<typeof openShepDb> | null = null;
  try {
    db = openShepDb();
    await seedOptimisticClickFeature(db);
    setCollaborationFlag(db, true);
  } finally {
    db?.close();
  }
}
