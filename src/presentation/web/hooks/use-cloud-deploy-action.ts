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

/**
 * Read a Response body safely. Routes are SUPPOSED to always return JSON, but
 * in dev mode Next.js may return an HTML error page when a route module fails
 * to compile or a request crashes the server. Naive `await res.json()` then
 * throws "Unexpected token < in JSON" which surfaces nothing useful to the
 * user. This helper returns the parsed JSON when possible and falls back to a
 * truncated text snippet so the UI can show what actually came back.
 */
async function readResponseBody(
  res: Response
): Promise<{ json: unknown; text: string; isJson: boolean }> {
  const text = await res.text().catch(() => '');
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return { json: JSON.parse(text), text, isJson: true };
    } catch {
      return { json: null, text, isJson: false };
    }
  }
  // Not declared JSON — try anyway in case the server forgot the header.
  try {
    return { json: JSON.parse(text), text, isJson: true };
  } catch {
    return { json: null, text, isJson: false };
  }
}

function snippet(text: string, max = 200): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max)}…`;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const { json, text, isJson } = await readResponseBody(res);
  if (isJson && json && typeof json === 'object' && 'error' in json) {
    const err = (json as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
  }
  if (text.length > 0) return `${fallback} (HTTP ${res.status}: ${snippet(text)})`;
  return `${fallback} (HTTP ${res.status})`;
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
      const { json, isJson } = await readResponseBody(res);
      if (!isJson) return;
      setState(dtoToState(json as CloudDeploymentStatusDto));
    } catch {
      // swallow — next poll will recover
    }
  }, [applicationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectProvider = useCallback(
    async (provider: CloudDeploymentProvider) => {
      // Optimistic local update so the button label reflects the choice
      // immediately. We still throw on persistence failure so the caller can
      // surface it (rather than silently drifting from server state).
      setState((s) => ({ ...s, provider }));
      const res = await fetch(`/api/applications/${applicationId}/cloud-deploy/select-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const message = await extractErrorMessage(res, 'Failed to select provider');
        throw new Error(message);
      }
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
    let res: Response;
    try {
      res = await fetch(`/api/applications/${applicationId}/cloud-deploy/initiate`, {
        method: 'POST',
      });
    } catch (err) {
      // Network-level failure (server down, CORS, etc.) — surface verbatim so
      // the user knows it's not a server-side validation error.
      const message = err instanceof Error ? err.message : 'Network error contacting server';
      setState((s) => ({
        ...s,
        status: CloudDeploymentStatus.Failed,
        error: message,
        isWorking: false,
      }));
      return;
    }
    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to start deploy');
      setState((s) => ({
        ...s,
        status: CloudDeploymentStatus.Failed,
        error: message,
        isWorking: false,
      }));
      return;
    }
    // Poll until the deployment reaches a terminal state (Deployed or
    // Failed) or a hard safety-net timeout fires. Earlier versions capped
    // this at 15s which was shorter than a real Cloudflare deploy — that
    // left the UI frozen on "Deploying…" forever and required a manual
    // reload to see the final outcome. 10 minutes is well over the P99
    // wrangler deploy time and well under any sensible "user gave up"
    // threshold; we still break EARLY on terminal status so the poll
    // stops within 1.5s of completion.
    const POLL_INTERVAL_MS = 1500;
    const HARD_TIMEOUT_MS = 10 * 60 * 1000;
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += POLL_INTERVAL_MS;
      try {
        const statusRes = await fetch(`/api/applications/${applicationId}/cloud-deploy/status`);
        if (statusRes.ok) {
          const { json, isJson } = await readResponseBody(statusRes);
          if (isJson) {
            const dto = json as CloudDeploymentStatusDto;
            const next = dtoToState(dto);
            setState(next);
            if (
              next.status === CloudDeploymentStatus.Deployed ||
              next.status === CloudDeploymentStatus.Failed
            ) {
              clearInterval(interval);
              return;
            }
          }
        }
      } catch {
        // Transient network hiccup — try again on the next tick.
      }
      if (elapsed >= HARD_TIMEOUT_MS) {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);
  }, [applicationId]);

  const connect = useCallback(async (provider: CloudDeploymentProvider, token: string) => {
    const res = await fetch(`/api/cloud-providers/${provider}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to connect cloud provider');
      throw new Error(message);
    }
  }, []);

  return { state, refresh, selectProvider, initiate, connect };
}
