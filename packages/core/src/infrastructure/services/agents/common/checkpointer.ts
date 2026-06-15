import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { getShepCheckpointsDir } from '../../filesystem/shep-directory.service.js';

/**
 * Resolves the checkpoint database path for a feature/exploration agent run.
 * Derived from SHEP_HOME so multiple instances keep separate agent state.
 *
 * @param checkpointId - The thread/run id used as the checkpoint key
 * @returns Absolute path to the checkpoint .db file
 */
export function getCheckpointPath(checkpointId: string): string {
  return join(getShepCheckpointsDir(), `${checkpointId}.db`);
}

/**
 * Resolves the checkpoint database path for a cluster agent run.
 *
 * @param checkpointId - The thread/run id used as the checkpoint key
 * @returns Absolute path to the cluster checkpoint .db file
 */
export function getClusterCheckpointPath(checkpointId: string): string {
  return join(getShepCheckpointsDir(), `cluster-${checkpointId}.db`);
}

/**
 * Creates a SQLite-backed checkpoint saver for LangGraph state persistence.
 * Ensures the parent directory exists for file-based paths.
 *
 * @param dbPath - Path to the SQLite database file (e.g., ':memory:' or a file path)
 * @returns A SqliteSaver instance ready for use as a LangGraph checkpointer
 */
export function createCheckpointer(dbPath: string): SqliteSaver {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  return SqliteSaver.fromConnString(dbPath);
}
