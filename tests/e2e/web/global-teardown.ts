import { openShepDb } from './helpers/collaboration-flag';
import { removeOptimisticClickFeature } from './helpers/feature-fixtures';

export default async function globalTeardown(): Promise<void> {
  let db: ReturnType<typeof openShepDb> | null = null;
  try {
    db = openShepDb();
    await removeOptimisticClickFeature(db);
  } finally {
    db?.close();
  }
}
