/**
 * Polling regression test for DeploymentStatusProvider.
 *
 * The agentic dev-server graph runs Analyzing -> Installing -> Booting
 * before Ready. Polling must stay alive through every one of those
 * stages (not just Booting/Ready) so the UI keeps refreshing until the
 * deployment either reaches Ready or is torn down (Stopped / removed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';

const mockDeployFeature = vi.fn();
const mockGetDeploymentStatus = vi.fn();

vi.mock('@/app/actions/deploy-feature', () => ({
  deployFeature: (...args: unknown[]) => mockDeployFeature(...args),
}));
vi.mock('@/app/actions/deploy-repository', () => ({
  deployRepository: vi.fn(),
}));
vi.mock('@/app/actions/deploy-application', () => ({
  deployApplication: vi.fn(),
}));
vi.mock('@/app/actions/stop-deployment', () => ({
  stopDeployment: vi.fn(),
}));
vi.mock('@/app/actions/get-deployment-status', () => ({
  getDeploymentStatus: (...args: unknown[]) => mockGetDeploymentStatus(...args),
}));

const POLL_INTERVAL_MS = 3000;

const featureInput = {
  targetId: 'feature-poll',
  targetType: 'feature' as const,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/my-feature',
};

function withProvider(children: ReactNode) {
  return <DeploymentStatusProvider initialDeployments={[]}>{children}</DeploymentStatusProvider>;
}

describe('DeploymentStatusProvider polling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps polling through Analyzing -> Installing -> Booting -> Ready, then stops on null (Stopped)', async () => {
    mockDeployFeature.mockResolvedValue({ success: true, state: DeploymentState.Analyzing });

    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) => withProvider(children),
    });

    await act(async () => {
      await result.current.deploy();
    });
    expect(result.current.status).toBe(DeploymentState.Analyzing);

    // Poll 1 — still Analyzing.
    mockGetDeploymentStatus.mockResolvedValueOnce({ state: DeploymentState.Analyzing, url: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(DeploymentState.Analyzing);

    // Poll 2 — transitions to Installing. Polling must continue.
    mockGetDeploymentStatus.mockResolvedValueOnce({
      state: DeploymentState.Installing,
      url: null,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe(DeploymentState.Installing);

    // Poll 3 — transitions to Booting. Polling must continue.
    mockGetDeploymentStatus.mockResolvedValueOnce({ state: DeploymentState.Booting, url: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe(DeploymentState.Booting);

    // Poll 4 — transitions to Ready. Polling must continue (Ready is
    // still an active state — a user-triggered Stop is what ends it).
    mockGetDeploymentStatus.mockResolvedValueOnce({
      state: DeploymentState.Ready,
      url: 'http://localhost:5173',
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(4);
    expect(result.current.status).toBe(DeploymentState.Ready);
    expect(result.current.url).toBe('http://localhost:5173');

    // Poll 5 — the server reports gone (null). Polling must stop.
    mockGetDeploymentStatus.mockResolvedValueOnce(null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(5);
    expect(result.current.status).toBeNull();

    // Poll interval should have been cleared — advancing further makes
    // no additional calls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(5);
  });

  it('keeps polling through Analyzing/Installing and stops immediately when the state is Stopped', async () => {
    mockDeployFeature.mockResolvedValue({ success: true, state: DeploymentState.Installing });

    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) => withProvider(children),
    });

    await act(async () => {
      await result.current.deploy();
    });
    expect(result.current.status).toBe(DeploymentState.Installing);

    mockGetDeploymentStatus.mockResolvedValueOnce({ state: DeploymentState.Stopped, url: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(result.current.status).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(mockGetDeploymentStatus).toHaveBeenCalledTimes(1);
  });
});
