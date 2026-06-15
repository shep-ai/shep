/**
 * Checkpoint Store Interface
 *
 * Output port for managing LangGraph checkpoint database files that persist
 * agent run state. Use cases depend on this interface so they never compute
 * filesystem paths or touch the disk directly (which would violate the
 * dependency rule and break SHEP_HOME-based instance isolation).
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the concrete implementation (CheckpointStore),
 *   which resolves paths under SHEP_HOME
 */
export interface ICheckpointStore {
  /**
   * Deletes the checkpoint database file for a given checkpoint id.
   * Must be idempotent — a missing file is not an error.
   *
   * @param checkpointId - The thread/run id used as the checkpoint key
   */
  deleteCheckpoint(checkpointId: string): Promise<void>;
}
