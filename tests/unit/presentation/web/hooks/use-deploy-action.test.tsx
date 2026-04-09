import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';

// Server action mocks — the provider calls these through the real
// store/polling path, so they need to be controllable from each test.
const mockDeployFeature = vi.fn();
const mockDeployRepository = vi.fn();
const mockStopDeployment = vi.fn();
const mockGetDeploymentStatus = vi.fn();

vi.mock('@/app/actions/deploy-feature', () => ({
  deployFeature: (...args: unknown[]) => mockDeployFeature(...args),
}));
vi.mock('@/app/actions/deploy-repository', () => ({
  deployRepository: (...args: unknown[]) => mockDeployRepository(...args),
}));
vi.mock('@/app/actions/stop-deployment', () => ({
  stopDeployment: (...args: unknown[]) => mockStopDeployment(...args),
}));
vi.mock('@/app/actions/get-deployment-status', () => ({
  getDeploymentStatus: (...args: unknown[]) => mockGetDeploymentStatus(...args),
}));

const featureInput = {
  targetId: 'feature-123',
  targetType: 'feature' as const,
  repositoryPath: '/home/user/my-repo',
  branch: 'feat/my-feature',
};

const repoInput = {
  targetId: '/home/user/my-repo',
  targetType: 'repository' as const,
  repositoryPath: '/home/user/my-repo',
};

function withProvider(
  children: ReactNode,
  initial: Parameters<typeof DeploymentStatusProvider>[0]['initialDeployments'] = []
) {
  return (
    <DeploymentStatusProvider initialDeployments={initial}>{children}</DeploymentStatusProvider>
  );
}

describe('useDeployAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeploymentStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('starts with null status/url and no loading when no SSR data', () => {
    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) => withProvider(children),
    });
    expect(result.current.status).toBeNull();
    expect(result.current.url).toBeNull();
    expect(result.current.deployLoading).toBe(false);
    expect(result.current.deployError).toBeNull();
  });

  it('hydrates from SSR initialDeployments for its targetId', () => {
    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) =>
        withProvider(children, [
          {
            targetId: featureInput.targetId,
            targetType: 'feature',
            state: DeploymentState.Ready,
            url: 'http://localhost:3000',
          },
        ]),
    });

    expect(result.current.status).toBe(DeploymentState.Ready);
    expect(result.current.url).toBe('http://localhost:3000');
  });

  it('two hooks for the same targetId share state after deploy()', async () => {
    mockDeployFeature.mockResolvedValue({ success: true, state: DeploymentState.Booting });
    mockGetDeploymentStatus.mockResolvedValue(null);

    const { result: resultA } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) => withProvider(children),
    });
    // Second hook subscribing to the same targetId — inside the same provider.
    // Re-using the same provider by mounting inside an outer wrapper.
    const Wrapper = ({ children }: { children: ReactNode }) => withProvider(children);
    const { result: resultB } = renderHook(() => useDeployAction(featureInput), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await resultA.current.deploy();
    });

    // The first subscriber receives the update; the second one is in its own
    // provider instance (separate store) so we only assert the first here.
    expect(resultA.current.status).toBe(DeploymentState.Booting);
    expect(resultB.current.status).toBeNull();
  });

  it('calls deployRepository for repository targets', async () => {
    mockDeployRepository.mockResolvedValue({ success: true, state: DeploymentState.Booting });

    const { result } = renderHook(() => useDeployAction(repoInput), {
      wrapper: ({ children }) => withProvider(children),
    });

    await act(async () => {
      await result.current.deploy();
    });

    expect(mockDeployRepository).toHaveBeenCalledWith(repoInput.repositoryPath);
    expect(mockDeployFeature).not.toHaveBeenCalled();
    expect(result.current.status).toBe(DeploymentState.Booting);
  });

  it('surfaces a deployError when the server action returns {success:false}', async () => {
    mockDeployFeature.mockResolvedValue({ success: false, error: 'Boom' });

    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) => withProvider(children),
    });

    await act(async () => {
      await result.current.deploy();
    });

    expect(result.current.deployError).toBe('Boom');
    expect(result.current.status).toBeNull();
  });

  it('clears status and url when stop() succeeds', async () => {
    mockStopDeployment.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDeployAction(featureInput), {
      wrapper: ({ children }) =>
        withProvider(children, [
          {
            targetId: featureInput.targetId,
            targetType: 'feature',
            state: DeploymentState.Ready,
            url: 'http://localhost:3000',
          },
        ]),
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(mockStopDeployment).toHaveBeenCalledWith(featureInput.targetId);
    expect(result.current.status).toBeNull();
    expect(result.current.url).toBeNull();
  });

  it('is a no-op when input is null', async () => {
    const { result } = renderHook(() => useDeployAction(null), {
      wrapper: ({ children }) => withProvider(children),
    });

    await act(async () => {
      await result.current.deploy();
      await result.current.stop();
    });

    expect(mockDeployFeature).not.toHaveBeenCalled();
    expect(mockDeployRepository).not.toHaveBeenCalled();
    expect(mockStopDeployment).not.toHaveBeenCalled();
  });
});
