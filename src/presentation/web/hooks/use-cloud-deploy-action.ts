'use client';

/**
 * Cloud deploy state hook.
 *
 * Single source of truth for the Deploy button state on the application page.
 * Seeds from GET /api/applications/:id/cloud-deploy/status on mount, then
 * updates via the agent-events SSE stream (phase 11 extension) and imperative
 * mutations called from the button itself.
 *
 * Intentionally NOT importing from `@shepai/core/infrastructure/*` — this
 * hook is presentation-only and talks to the core layer through the HTTP
 * use-case boundary exposed in phase 9.
 */

import { useCallback, useEffect, useState } from 'react';
import { CloudDeploymentStatus } from '@shepai/core/domain/generated/output';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';

export interface CloudDeployActionState {
  provider: CloudDeploymentProvider | null;
  status: CloudDeploymentStatus;
  url: string | null;
  error: string | null;
  deploymentId: string | null;
  lastDeployedAt: Date | null;
  isWorking: boolean;
}

export interface CloudDeployActionApi {
  state: CloudDeployActionState;
  refresh(): Promise<void>;
  selectProvider(provider: CloudDeploymentProvider): Promise<void>;
  initiate(): Promise<void>;
  connect(provider: CloudDeploymentProvider, token: string): Promise<void>;
}

const INITIAL_STATE: CloudDeployActionState = {
  provider: null,
  status: CloudDeploymentStatus.NotDeployed,
  url: null,
  error: null,
  deploymentId: null,
  lastDeployedAt: null,
  isWorking: false,
};

const WORKING_STATUSES = new Set<CloudDeploymentStatus>([
  CloudDeploymentStatus.Building,
  CloudDeploymentStatus.Uploading,
  CloudDeploymentStatus.Deploying,
]);

function isWorking(status: CloudDeploymentStatus): boolean {
  return WORKING_STATUSES.has(status);
}

interface CloudDeploymentStatusDto {
  provider?: CloudDeploymentProvider;
  status?: CloudDeploymentStatus;
  deploymentId?: string;
  url?: string;
  error?: string;
  lastDeployedAt?: string | number | Date;
  gitRemoteUrl?: string;
}

function dtoToState(dto: CloudDeploymentStatusDto): CloudDeployActionState {
  const status = dto.status ?? CloudDeploymentStatus.NotDeployed;
  return {
    provider: dto.provider ?? null,
    status,
    url: dto.url ?? null,
    error: dto.error ?? null,
    deploymentId: dto.deploymentId ?? null,
    lastDeployedAt: dto.lastDeployedAt ? new Date(dto.lastDeployedAt) : null,
    isWorking: isWorking(status),
  };
}

export function useCloudDeployAction(applicationId: string): CloudDeployActionApi {
  const [state, setState] = useState<CloudDeployActionState>(INITIAL_STATE);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/applications/${applicationId}/cloud-deploy/status`);
      if (!res.ok) return;
      const dto = (await res.json()) as CloudDeploymentStatusDto;
      setState(dtoToState(dto));
    } catch {
      // swallow — next poll will recover
    }
  }, [applicationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectProvider = useCallback(
    async (provider: CloudDeploymentProvider) => {
      setState((s) => ({ ...s, provider }));
      await fetch(`/api/applications/${applicationId}/cloud-deploy/select-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
    },
    [applicationId]
  );

  const initiate = useCallback(async () => {
    setState((s) => ({
      ...s,
      status: CloudDeploymentStatus.Uploading,
      error: null,
      isWorking: true,
    }));
    const res = await fetch(`/api/applications/${applicationId}/cloud-deploy/initiate`, {
      method: 'POST',
    });
    if (!res.ok) {
      let message = 'Failed to start deploy';
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // keep default
      }
      setState((s) => ({
        ...s,
        status: CloudDeploymentStatus.Failed,
        error: message,
        isWorking: false,
      }));
      return;
    }
    // Subsequent progress flows in via the SSE stream (phase 11) and the
    // refresh() polling. We keep a refresh timer for ~10s as a safety net.
    let elapsed = 0;
    const interval = setInterval(() => {
      void refresh();
      elapsed += 1500;
      if (elapsed > 15_000) clearInterval(interval);
    }, 1500);
  }, [applicationId, refresh]);

  const connect = useCallback(async (provider: CloudDeploymentProvider, token: string) => {
    const res = await fetch(`/api/cloud-providers/${provider}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? 'Failed to connect cloud provider');
    }
  }, []);

  return { state, refresh, selectProvider, initiate, connect };
}
