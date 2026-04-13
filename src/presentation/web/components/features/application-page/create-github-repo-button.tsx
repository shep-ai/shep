'use client';

/**
 * CreateGitHubRepoButton — one-click "Create a GitHub repo for this app".
 *
 * Uses `gh` CLI under the hood via CreateGitRemoteUseCase. If the local
 * `gh` is not signed in, the button transitions to "Sign in with GitHub",
 * spawns `gh auth login --web` via POST /api/cloud-providers/github/auth-login,
 * polls auth-status until the user completes the browser flow, then
 * retries the create automatically.
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GitHubIcon } from './cloud-provider-icons';

export interface CreateGitHubRepoButtonProps {
  applicationId: string;
  /** Pre-existing remote URL if one is already attached. */
  initialRemoteUrl?: string | null;
  disabled?: boolean;
  className?: string;
}

type ButtonState =
  | { kind: 'no-remote' }
  | { kind: 'creating' }
  | { kind: 'gh-sign-in-required'; retrying: boolean }
  | { kind: 'has-remote'; url: string }
  | { kind: 'failed'; error: string };

async function createRemote(applicationId: string): Promise<Response> {
  return fetch(`/api/applications/${applicationId}/git/create-remote`, { method: 'POST' });
}

async function fetchGhAuthStatus(): Promise<{ authenticated: boolean }> {
  const res = await fetch('/api/cloud-providers/github/auth-status');
  if (!res.ok) return { authenticated: false };
  return (await res.json()) as { authenticated: boolean };
}

export function CreateGitHubRepoButton({
  applicationId,
  initialRemoteUrl,
  disabled,
  className,
}: CreateGitHubRepoButtonProps) {
  const [state, setState] = useState<ButtonState>(
    initialRemoteUrl ? { kind: 'has-remote', url: initialRemoteUrl } : { kind: 'no-remote' }
  );

  const runCreate = useCallback(async () => {
    setState({ kind: 'creating' });
    const res = await createRemote(applicationId);
    if (res.ok) {
      const body = (await res.json()) as { remoteUrl: string };
      setState({ kind: 'has-remote', url: body.remoteUrl });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
    if (body.code === 'GH_NOT_AUTHENTICATED') {
      setState({ kind: 'gh-sign-in-required', retrying: false });
      return;
    }
    setState({ kind: 'failed', error: body.error ?? 'Failed to create repository' });
  }, [applicationId]);

  const runGhSignIn = useCallback(async () => {
    setState({ kind: 'gh-sign-in-required', retrying: true });
    try {
      await fetch('/api/cloud-providers/github/auth-login', { method: 'POST' });
    } catch {
      /* surface via polling */
    }
  }, []);

  // When we're in the retrying substate, poll auth-status until it flips.
  useEffect(() => {
    if (state.kind !== 'gh-sign-in-required' || !state.retrying) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      const { authenticated } = await fetchGhAuthStatus();
      if (authenticated) {
        clearInterval(timer);
        if (!cancelled) void runCreate();
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state, runCreate]);

  const baseClass =
    'h-7 px-2 border rounded-md text-[11px] inline-flex items-center gap-1 transition-colors';

  if (state.kind === 'has-remote') {
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseClass, 'text-foreground/80 hover:text-foreground', className)}
        title="Open GitHub repository"
      >
        <GitHubIcon className="size-3" />
        <span className="max-w-[14ch] truncate">{state.url.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="size-3" />
      </a>
    );
  }

  if (state.kind === 'creating') {
    return (
      <button type="button" disabled className={cn(baseClass, className, 'opacity-60')}>
        <Loader2 className="size-3 animate-spin" />
        Creating repo…
      </button>
    );
  }

  if (state.kind === 'gh-sign-in-required') {
    return (
      <button
        type="button"
        onClick={runGhSignIn}
        disabled={state.retrying || disabled}
        className={cn(baseClass, 'border-primary text-primary', className)}
        title="Sign in with GitHub"
      >
        {state.retrying ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <GitHubIcon className="size-3" />
        )}
        <span>{state.retrying ? 'Waiting for sign-in…' : 'Sign in with GitHub'}</span>
      </button>
    );
  }

  if (state.kind === 'failed') {
    return (
      <button
        type="button"
        onClick={runCreate}
        disabled={disabled}
        className={cn(baseClass, 'border-destructive text-destructive', className)}
        title={state.error}
      >
        <TriangleAlert className="size-3" />
        <span>Retry</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={runCreate}
      disabled={disabled}
      className={cn(baseClass, className)}
      title="Create a GitHub repository for this app"
    >
      <GitBranch className="size-3" />
      <span>Create GitHub repo</span>
    </button>
  );
}
