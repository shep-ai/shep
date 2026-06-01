/**
 * SDLC Board Context
 *
 * Module-level singleton that allows the implement node to write task and
 * sub-task progress to the SDLC Kanban Board as phases execute, following
 * the same pattern as lifecycle-context.ts and phase-timing-context.ts.
 *
 * The worker calls setSdlcBoardContext() once after DI init, passing an
 * ISdlcBoardTracker instance and the featureId. The implement node then
 * calls the consumer functions (seedBoardTasks, setBoardTaskStatus,
 * setBoardSubTaskStatus) to write progress.
 *
 * All consumer functions are BEST-EFFORT: errors are swallowed so board
 * telemetry never blocks or fails graph execution.
 *
 * If the context was never set (e.g. unit tests, fast mode, other agent
 * types), every consumer function no-ops silently.
 */

import type {
  ISdlcBoardTracker,
  SeedTask,
} from '@/application/ports/output/agents/sdlc-board-tracker.interface.js';
import { type TaskState } from '@/domain/generated/output.js';

let contextFeatureId: string | undefined;
let contextTracker: ISdlcBoardTracker | undefined;

/**
 * Set the SDLC board context. Called once by the worker after DI init.
 *
 * @param featureId - The feature (epic) being processed.
 * @param tracker   - An ISdlcBoardTracker instance from the DI container.
 */
export function setSdlcBoardContext(featureId: string, tracker: ISdlcBoardTracker): void {
  contextFeatureId = featureId;
  contextTracker = tracker;
}

/**
 * Clear the SDLC board context. Useful for testing.
 */
export function clearSdlcBoardContext(): void {
  contextFeatureId = undefined;
  contextTracker = undefined;
}

/**
 * Idempotent upsert of the full task plan onto the board.
 * Forwards to ISdlcBoardTracker.seedTasks with the stored featureId.
 * No-op if context is not set. Errors are swallowed (best-effort).
 *
 * @param tasks - Ordered array of tasks with their nested sub-tasks.
 */
export async function seedBoardTasks(tasks: SeedTask[]): Promise<void> {
  if (!contextFeatureId || !contextTracker) return;

  try {
    await contextTracker.seedTasks(contextFeatureId, tasks);
  } catch {
    // Swallow — board telemetry is non-fatal
  }
}

/**
 * Transition a task's workflow state on the board.
 * No-op if context is not set. Errors are swallowed (best-effort).
 *
 * @param taskKey - Stable idempotency key (e.g. `'phase-1'`).
 * @param status  - New TaskState value.
 */
export async function setBoardTaskStatus(taskKey: string, status: TaskState): Promise<void> {
  if (!contextFeatureId || !contextTracker) return;

  try {
    await contextTracker.setTaskStatus(contextFeatureId, taskKey, status);
  } catch {
    // Swallow — board telemetry is non-fatal
  }
}

/**
 * Transition a sub-task's workflow state on the board.
 * No-op if context is not set. Errors are swallowed (best-effort).
 *
 * @param taskKey    - Stable key identifying the parent task (phase).
 * @param subTaskKey - Stable key identifying the sub-task (tasks.yaml task).
 * @param status     - New TaskState value.
 */
export async function setBoardSubTaskStatus(
  taskKey: string,
  subTaskKey: string,
  status: TaskState
): Promise<void> {
  if (!contextFeatureId || !contextTracker) return;

  try {
    await contextTracker.setSubTaskStatus(contextFeatureId, taskKey, subTaskKey, status);
  } catch {
    // Swallow — board telemetry is non-fatal
  }
}
