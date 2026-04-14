import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '@shepai/core/domain/generated/output';
import { useSmartDeployState } from '@/hooks/use-smart-deploy-state';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import type { GitStatusDto } from '@/hooks/use-git-status';
import type { SyncActionState } from '@/hooks/use-sync-action';

function makeCloud(overrides: Partial<CloudDeployActionApi['state']> = {}): CloudDeployActionApi {
  return {
    state: {
      provider: CloudDeploymentProvider.CloudflarePages,
      status: CloudDeploymentStatus.NotDeployed,
      url: null,
      error: null,
      deploymentId: null,
      lastDeployedAt: null,
      isWorking: false,
      ...overrides,
    },
    refresh: async () => undefined,
    selectProvider: async () => undefined,
    initiate: async () => undefined,
    connect: async () => undefined,
  };
}

const idleSync: SyncActionState = { kind: 'idle' };

describe('useSmartDeployState', () => {
  it('returns loading ONLY while still fetching AND no persisted URL', () => {
    const { result } = renderHook(() =>
      useSmartDeployState({
        gitStatus: null,
        gitStatusLoading: true,
        persistedRemoteUrl: null,
        cloudDeploy: makeCloud(),
        syncAction: idleSync,
        hasConnectedCloudProvider: false,
      })
    );
    expect(result.current.kind).toBe('loading');
  });

  it('does NOT lock on loading when the live fetch failed but a persisted URL exists (regression)', () => {
    // Repro: the /git/status route is unreachable, useGitStatus catches
    // the error, leaves status=null and loading=false. The old version
    // of the smart state would return `loading` forever because of the
    // null check. The fix: persistedRemoteUrl synthesizes a sensible
    // status so the state machine can produce a real label.
    const { result } = renderHook(() =>
      useSmartDeployState({
        gitStatus: null,
        gitStatusLoading: false,
        persistedRemoteUrl: 'https://github.com/blackpc/landing-page-hero',
        cloudDeploy: makeCloud({
          status: CloudDeploymentStatus.Deployed,
          url: 'https://example.pages.dev',
        }),
        syncAction: idleSync,
        hasConnectedCloudProvider: true,
      })
    );
    // Should resolve to "live" since the cloud is deployed and we have
    // a remote (from persistedRemoteUrl) — not stuck on loading.
    expect(result.current.kind).toBe('live');
    expect(result.current.hasRemote).toBe(true);
    expect(result.current.liveUrl).toBe('https://example.pages.dev');
  });

  it('falls back to getOnline when neither live nor persisted URL is available after first fetch', () => {
    const { result } = renderHook(() =>
      useSmartDeployState({
        gitStatus: null,
        gitStatusLoading: false,
        persistedRemoteUrl: null,
        cloudDeploy: makeCloud(),
        syncAction: idleSync,
        hasConnectedCloudProvider: false,
      })
    );
    expect(result.current.kind).toBe('getOnline');
    expect(result.current.hasRemote).toBe(false);
  });

  it('uses live status counts when present even when persisted URL is also set', () => {
    const liveStatus: GitStatusDto = {
      branch: 'main',
      uncommittedCount: 3,
      unpushedCount: 0,
      hasRemote: true,
      remoteUrl: 'https://github.com/u/r',
    };
    const { result } = renderHook(() =>
      useSmartDeployState({
        gitStatus: liveStatus,
        gitStatusLoading: false,
        persistedRemoteUrl: 'https://github.com/u/r',
        cloudDeploy: makeCloud(),
        syncAction: idleSync,
        hasConnectedCloudProvider: true,
      })
    );
    expect(result.current.kind).toBe('pushAndDeploy');
    expect(result.current.changeCount).toBe(3);
  });

  it('reports working state when sync is in flight', () => {
    const { result } = renderHook(() =>
      useSmartDeployState({
        gitStatus: {
          branch: 'main',
          uncommittedCount: 0,
          unpushedCount: 0,
          hasRemote: true,
          remoteUrl: 'https://github.com/u/r',
        },
        gitStatusLoading: false,
        persistedRemoteUrl: 'https://github.com/u/r',
        cloudDeploy: makeCloud(),
        syncAction: { kind: 'running' },
        hasConnectedCloudProvider: true,
      })
    );
    expect(result.current.kind).toBe('working');
  });
});
