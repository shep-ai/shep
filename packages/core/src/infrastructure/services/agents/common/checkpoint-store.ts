/**
 * Checkpoint Store
 *
 * Infrastructure implementation of ICheckpointStore. Resolves checkpoint
 * database paths under SHEP_HOME (via getCheckpointPath) so each Shep instance
 * manages its own agent state, and removes the file on deletion.
 */

import { injectable } from 'tsyringe';
import { unlink } from 'node:fs/promises';

import type { ICheckpointStore } from '../../../../application/ports/output/services/checkpoint-store.interface.js';
import { getCheckpointPath } from './checkpointer.js';

@injectable()
export class CheckpointStore implements ICheckpointStore {
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    try {
      await unlink(getCheckpointPath(checkpointId));
    } catch {
      // Checkpoint file may not exist or already be removed — deletion is idempotent.
    }
  }
}
