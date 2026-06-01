/**
 * SdlcBoardContext — unit tests (spec sdlc-board, Phase 4).
 *
 * Tests for the module-level singleton that wires the feature-agent worker
 * to the ISdlcBoardTracker port, following the same pattern as
 * lifecycle-context.test.ts.
 *
 * Covers:
 * - Consumer fns forward to the tracker with the stored featureId.
 * - All consumer fns are no-ops when context was never set.
 * - All consumer fns are no-ops after clearSdlcBoardContext().
 * - A tracker that rejects does NOT cause the consumer fn to throw (best-effort).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setSdlcBoardContext,
  clearSdlcBoardContext,
  seedBoardTasks,
  setBoardTaskStatus,
  setBoardSubTaskStatus,
} from '@/infrastructure/services/agents/feature-agent/sdlc-board-context.js';
import type {
  ISdlcBoardTracker,
  SeedTask,
} from '@/application/ports/output/agents/sdlc-board-tracker.interface.js';
import { TaskState } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTracker(): ISdlcBoardTracker {
  return {
    seedTasks: vi.fn().mockResolvedValue(undefined),
    setTaskStatus: vi.fn().mockResolvedValue(undefined),
    setSubTaskStatus: vi.fn().mockResolvedValue(undefined),
  };
}

const FEATURE_ID = 'feat-abc-123';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SdlcBoardContext', () => {
  beforeEach(() => {
    clearSdlcBoardContext();
  });

  // -------------------------------------------------------------------------
  // No-op when context is not set
  // -------------------------------------------------------------------------

  describe('when context is not set', () => {
    it('seedBoardTasks should no-op without throwing', async () => {
      const tasks: SeedTask[] = [
        { taskKey: 'phase-1', title: 'Phase 1', sortOrder: 0, subTasks: [] },
      ];
      await expect(seedBoardTasks(tasks)).resolves.toBeUndefined();
    });

    it('setBoardTaskStatus should no-op without throwing', async () => {
      await expect(setBoardTaskStatus('phase-1', TaskState.WIP)).resolves.toBeUndefined();
    });

    it('setBoardSubTaskStatus should no-op without throwing', async () => {
      await expect(
        setBoardSubTaskStatus('phase-1', 'task-1', TaskState.Done)
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // No-op after clearSdlcBoardContext
  // -------------------------------------------------------------------------

  describe('after clearSdlcBoardContext', () => {
    it('seedBoardTasks should no-op without throwing after clear', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);
      clearSdlcBoardContext();

      await expect(
        seedBoardTasks([{ taskKey: 'phase-1', title: 'Phase 1', sortOrder: 0, subTasks: [] }])
      ).resolves.toBeUndefined();

      expect(tracker.seedTasks).not.toHaveBeenCalled();
    });

    it('setBoardTaskStatus should no-op without throwing after clear', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);
      clearSdlcBoardContext();

      await expect(setBoardTaskStatus('phase-1', TaskState.Done)).resolves.toBeUndefined();
      expect(tracker.setTaskStatus).not.toHaveBeenCalled();
    });

    it('setBoardSubTaskStatus should no-op without throwing after clear', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);
      clearSdlcBoardContext();

      await expect(
        setBoardSubTaskStatus('phase-1', 'task-1', TaskState.Done)
      ).resolves.toBeUndefined();
      expect(tracker.setSubTaskStatus).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Forwarding to tracker with stored featureId
  // -------------------------------------------------------------------------

  describe('when context is set', () => {
    it('seedBoardTasks forwards to tracker.seedTasks with stored featureId', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);

      const tasks: SeedTask[] = [
        {
          taskKey: 'phase-1',
          title: 'Phase One',
          description: 'First phase',
          sortOrder: 0,
          subTasks: [
            { subTaskKey: 'task-1', name: 'Task One', sortOrder: 0 },
            { subTaskKey: 'task-2', name: 'Task Two', sortOrder: 1 },
          ],
        },
        {
          taskKey: 'phase-2',
          title: 'Phase Two',
          sortOrder: 1,
          subTasks: [],
        },
      ];

      await seedBoardTasks(tasks);

      expect(tracker.seedTasks).toHaveBeenCalledOnce();
      expect(tracker.seedTasks).toHaveBeenCalledWith(FEATURE_ID, tasks);
    });

    it('setBoardTaskStatus forwards to tracker.setTaskStatus with stored featureId', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);

      await setBoardTaskStatus('phase-2', TaskState.WIP);

      expect(tracker.setTaskStatus).toHaveBeenCalledOnce();
      expect(tracker.setTaskStatus).toHaveBeenCalledWith(FEATURE_ID, 'phase-2', TaskState.WIP);
    });

    it('setBoardSubTaskStatus forwards to tracker.setSubTaskStatus with stored featureId', async () => {
      const tracker = makeTracker();
      setSdlcBoardContext(FEATURE_ID, tracker);

      await setBoardSubTaskStatus('phase-1', 'task-3', TaskState.Done);

      expect(tracker.setSubTaskStatus).toHaveBeenCalledOnce();
      expect(tracker.setSubTaskStatus).toHaveBeenCalledWith(
        FEATURE_ID,
        'phase-1',
        'task-3',
        TaskState.Done
      );
    });

    it('uses the correct featureId when multiple context sets occur', async () => {
      const tracker1 = makeTracker();
      const tracker2 = makeTracker();

      setSdlcBoardContext('feat-first', tracker1);
      setSdlcBoardContext('feat-second', tracker2);

      await setBoardTaskStatus('phase-1', TaskState.Done);

      // tracker2 gets the call with feat-second
      expect(tracker2.setTaskStatus).toHaveBeenCalledWith('feat-second', 'phase-1', TaskState.Done);
      // tracker1 should not have been called
      expect(tracker1.setTaskStatus).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Best-effort: tracker errors do NOT propagate
  // -------------------------------------------------------------------------

  describe('best-effort error handling', () => {
    it('seedBoardTasks does not throw when tracker.seedTasks rejects', async () => {
      const tracker = makeTracker();
      (tracker.seedTasks as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
      setSdlcBoardContext(FEATURE_ID, tracker);

      await expect(
        seedBoardTasks([{ taskKey: 'phase-1', title: 'Phase 1', sortOrder: 0, subTasks: [] }])
      ).resolves.toBeUndefined();
    });

    it('setBoardTaskStatus does not throw when tracker.setTaskStatus rejects', async () => {
      const tracker = makeTracker();
      (tracker.setTaskStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused')
      );
      setSdlcBoardContext(FEATURE_ID, tracker);

      await expect(setBoardTaskStatus('phase-1', TaskState.WIP)).resolves.toBeUndefined();
    });

    it('setBoardSubTaskStatus does not throw when tracker.setSubTaskStatus rejects', async () => {
      const tracker = makeTracker();
      (tracker.setSubTaskStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Timeout')
      );
      setSdlcBoardContext(FEATURE_ID, tracker);

      await expect(
        setBoardSubTaskStatus('phase-1', 'task-1', TaskState.Done)
      ).resolves.toBeUndefined();
    });
  });
});
