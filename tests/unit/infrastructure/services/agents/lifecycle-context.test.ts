/**
 * Lifecycle Context Unit Tests
 *
 * Tests for the module-level singleton that allows graph nodes
 * to update the feature's SDLC lifecycle as they execute.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setLifecycleContext,
  clearLifecycleContext,
  updateNodeLifecycle,
  setFeatureLifecycle,
} from '@/infrastructure/services/agents/feature-agent/lifecycle-context.js';
import { SdlcLifecycle } from '@/domain/generated/output.js';

function createMockUpdater() {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('LifecycleContext', () => {
  beforeEach(() => {
    clearLifecycleContext();
  });

  describe('setLifecycleContext / clearLifecycleContext', () => {
    it('should allow setting and clearing context', () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);
      clearLifecycleContext();
    });
  });

  describe('updateNodeLifecycle', () => {
    it('should update feature lifecycle to Analyze for analyze node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('analyze');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Analyze,
      });
    });

    it('should update feature lifecycle to Requirements for requirements node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('requirements');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Requirements,
      });
    });

    it('should update feature lifecycle to Research for research node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('research');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Research,
      });
    });

    it('should update feature lifecycle to Planning for plan node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('plan');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Planning,
      });
    });

    it('should update feature lifecycle to Implementation for implement node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('implement');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Implementation,
      });
    });

    it('should update feature lifecycle to Review for merge node', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('merge');

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Review,
      });
    });

    it('should be a no-op when context is not set', async () => {
      // No context set — should not throw
      await updateNodeLifecycle('analyze');
    });

    it('should be a no-op for unknown node names', async () => {
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await updateNodeLifecycle('validate_spec_analyze');

      expect(updater.execute).not.toHaveBeenCalled();
    });

    it('should not throw when updater execute fails', async () => {
      const updater = createMockUpdater();
      updater.execute.mockRejectedValue(new Error('DB error'));
      setLifecycleContext('feat-1', updater);

      // Should not throw
      await updateNodeLifecycle('analyze');
    });
  });

  describe('setFeatureLifecycle', () => {
    it('should route an explicit terminal lifecycle through the updater', async () => {
      // Terminal transitions (Maintain / AwaitingUpstream) have no graph node of
      // their own, so they cannot go through updateNodeLifecycle — yet they must
      // still fire CheckAndUnblockFeaturesUseCase for dependent children.
      const updater = createMockUpdater();
      setLifecycleContext('feat-1', updater);

      await setFeatureLifecycle(SdlcLifecycle.Maintain);

      expect(updater.execute).toHaveBeenCalledWith({
        featureId: 'feat-1',
        lifecycle: SdlcLifecycle.Maintain,
      });
    });

    it('should be a no-op when context is not set', async () => {
      await setFeatureLifecycle(SdlcLifecycle.Maintain);
    });

    it('should not throw when updater execute fails', async () => {
      const updater = createMockUpdater();
      updater.execute.mockRejectedValue(new Error('DB error'));
      setLifecycleContext('feat-1', updater);

      await setFeatureLifecycle(SdlcLifecycle.Maintain);
    });
  });
});
