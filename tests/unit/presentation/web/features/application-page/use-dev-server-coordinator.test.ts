/**
 * Unit tests for useDevServerCoordinator's status guards.
 *
 * The agentic dev-server graph adds Analyzing and Installing as
 * pre-Booting stages of DeploymentState. Two guards in this hook must
 * treat those stages exactly like Booting:
 *
 *   1. Agent-starts guard — stop the dev server when the agent starts a
 *      turn, for ANY active state (Analyzing/Installing/Booting/Ready),
 *      not just Ready/Booting.
 *   2. Agent-finishes guard (auto-deploy) — skip calling deploy.deploy()
 *      when a deployment is already active in ANY of those states, to
 *      avoid double-firing a deploy while a spawn is in flight (see
 *      LESSONS.md — deploy() is not idempotent and kills an in-flight
 *      spawn if called again).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';

import { useDevServerCoordinator } from '@/components/features/application-page/use-dev-server-coordinator';
import type { DeployActionState } from '@/hooks/use-deploy-action';

function makeDeploy(overrides: Partial<DeployActionState> = {}): DeployActionState {
  return {
    deploy: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    deployLoading: false,
    stopLoading: false,
    deployError: null,
    status: null,
    url: null,
    ...overrides,
  };
}

describe('useDevServerCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('agent-starts guard (stop)', () => {
    it.each([
      DeploymentState.Analyzing,
      DeploymentState.Installing,
      DeploymentState.Booting,
      DeploymentState.Ready,
    ])('stops the dev server when the agent starts and status is %s', (status) => {
      const deploy = makeDeploy({ status });
      const { rerender } = renderHook(
        ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
        { initialProps: { agentRunning: false } }
      );

      rerender({ agentRunning: true });

      expect(deploy.stop).toHaveBeenCalledTimes(1);
    });

    it('does not call stop when status is null (nothing to stop)', () => {
      const deploy = makeDeploy({ status: null });
      const { rerender } = renderHook(
        ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
        { initialProps: { agentRunning: false } }
      );

      rerender({ agentRunning: true });

      expect(deploy.stop).not.toHaveBeenCalled();
    });
  });

  describe('agent-finishes guard (auto-deploy)', () => {
    it.each([DeploymentState.Analyzing, DeploymentState.Installing, DeploymentState.Booting])(
      'does NOT call deploy() when the agent finishes and status is already %s (in flight)',
      (status) => {
        const deploy = makeDeploy({ status });
        const { rerender } = renderHook(
          ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
          { initialProps: { agentRunning: true } }
        );

        rerender({ agentRunning: false });

        expect(deploy.deploy).not.toHaveBeenCalled();
      }
    );

    it('does NOT call deploy() when status is already Ready', () => {
      const deploy = makeDeploy({ status: DeploymentState.Ready });
      const { rerender } = renderHook(
        ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
        { initialProps: { agentRunning: true } }
      );

      rerender({ agentRunning: false });

      expect(deploy.deploy).not.toHaveBeenCalled();
    });

    it('calls deploy() when the agent finishes and no deployment is active', () => {
      const deploy = makeDeploy({ status: null });
      const { rerender } = renderHook(
        ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
        { initialProps: { agentRunning: true } }
      );

      rerender({ agentRunning: false });

      expect(deploy.deploy).toHaveBeenCalledTimes(1);
    });

    it('does NOT call deploy() while deployLoading is true', () => {
      const deploy = makeDeploy({ status: null, deployLoading: true });
      const { rerender } = renderHook(
        ({ agentRunning }) => useDevServerCoordinator({ deploy, agentRunning }),
        { initialProps: { agentRunning: true } }
      );

      rerender({ agentRunning: false });

      expect(deploy.deploy).not.toHaveBeenCalled();
    });
  });
});
