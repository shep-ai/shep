'use client';

/**
 * PublishToGitHubButton — the user-facing entry point for publishing an
 * application to GitHub. Replaces the old "Create GitHub repo" button.
 *
 * State machine:
 *   • loading        — we're checking gh auth + listing owners on mount
 *   • has-remote     — application already has a gitRemoteUrl; show a chip
 *                       linking to the published repo
 *   • not-signed-in  — gh CLI isn't authenticated. Button is gated to the
 *                       sign-in flow; clicking opens gh auth login --web and
 *                       polls until done, then re-fetches owners
 *   • ready          — gh is authenticated + owners are loaded; button is
 *                       active and opens the PublishToGitHubModal
 *   • signing-in     — sign-in flow in progress (spinner)
 *   • publishing     — POST /api/applications/:id/git/create-remote in flight
 *   • failed         — show the error inline with a Retry action
 *
 * No business logic lives here — the button is a thin client over four
 * routes: /api/cloud-providers/github/auth-status, .../auth-login,
 * .../orgs, and .../applications/:id/git/create-remote.
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, GitBranch, Loader2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GitHubIcon } from './cloud-provider-icons';
import { PublishToGitHubModal, type PublishOwner } from './publish-to-github-modal';
import { OperationLogsDrawer } from './operation-logs-drawer';
import { OperationLogsIconButton, type OperationLogsIconState } from './operation-logs-icon-button';

export interface PublishToGitHubButtonProps {
  applicationId: string;
  /** Default repo name — typically the application slug. */
  defaultRepoName: string;
  /** Pre-existing remote URL if one is already attached. */
  initialRemoteUrl?: string | null;
  disabled?: boolean;
  className?: string;
}

type ButtonState =
  | { kind: 'loading' }
  | { kind: 'has-remote'; url: string }
  | { kind: 'not-signed-in' }
  | { kind: 'signing-in' }
  | { kind: 'ready'; owners: PublishOwner[] }
  | { kind: 'failed'; error: string; canRetry: boolean };

interface CreateRemoteSuccess {
  remoteUrl: string;
}

interface CreateRemoteError {
  error?: string;
  code?: string;
  ownerLogin?: string;
  repoName?: string;
}

const baseClass =
  'h-7 px-2 border rounded-md text-[11px] inline-flex items-center gap-1.5 transition-colors';
const interactiveHover = 'hover:bg-accent hover:text-accent-foreground cursor-pointer';

async function fetchAuthStatus(): Promise<{ authenticated: boolean }> {
  const res = await fetch('/api/cloud-providers/github/auth-status');
  if (!res.ok) return { authenticated: false };
  return (await res.json()) as { authenticated: boolean };
}

async function fetchOwners(): Promise<PublishOwner[] | { gated: true }> {
  const res = await fetch('/api/cloud-providers/github/orgs');
  if (res.status === 401) return { gated: true };
  if (!res.ok) throw new Error(`Failed to load owners (HTTP ${res.status})`);
  const body = (await res.json()) as { owners: PublishOwner[] };
  return body.owners;
}

export function PublishToGitHubButton({
  applicationId,
  defaultRepoName,
  initialRemoteUrl,
  disabled,
  className,
}: PublishToGitHubButtonProps) {
  const [state, setState] = useState<ButtonState>(
    initialRemoteUrl ? { kind: 'has-remote', url: initialRemoteUrl } : { kind: 'loading' }
  );
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [logsOpen, setLogsOpen] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (initialRemoteUrl) return;
    setState({ kind: 'loading' });
    try {
      const owners = await fetchOwners();
      if ('gated' in owners) {
        setState({ kind: 'not-signed-in' });
        return;
      }
      setState({ kind: 'ready', owners });
    } catch (err) {
      setState({
        kind: 'failed',
        error: err instanceof Error ? err.message : 'Failed to load GitHub owners',
        canRetry: true,
      });
    }
  }, [initialRemoteUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSignIn = useCallback(async () => {
    setState({ kind: 'signing-in' });
    try {
      await fetch('/api/cloud-providers/github/auth-login', { method: 'POST' });
    } catch {
      // surface via polling below
    }
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      const { authenticated } = await fetchAuthStatus();
      if (authenticated) {
        clearInterval(timer);
        if (!cancelled) await refresh();
      }
    }, 1500);
    // The polling effect cleans itself up the next time refresh() flips state.
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refresh]);

  const runPublish = useCallback(
    async (input: { ownerLogin: string; repoName: string; visibility: 'public' | 'private' }) => {
      // The MODAL owns the submitting spinner — don't touch outer state until
      // we have a definitive success or non-recoverable failure. That way the
      // dialog stays mounted and the user can fix their input and retry.
      const res = await fetch(`/api/applications/${applicationId}/git/create-remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const body = (await res.json()) as CreateRemoteSuccess;
        setState({ kind: 'has-remote', url: body.remoteUrl });
        setModalOpen(false);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as CreateRemoteError;
      if (body.code === 'GH_NOT_AUTHENTICATED') {
        // Auth flipped off mid-flight (rare). Close modal and route the user
        // back to sign-in.
        setModalOpen(false);
        setState({ kind: 'not-signed-in' });
        throw new Error('Sign in to GitHub first');
      }
      if (body.code === 'GH_REPO_NAME_TAKEN') {
        // Recoverable: surface inline in the modal so the user picks another
        // name without losing their context.
        throw new Error(
          body.error ??
            `That name is already taken on ${body.ownerLogin ?? 'this account'}. Try a different one.`
        );
      }
      // Non-recoverable failure: collapse to the failed branch with a Retry.
      const message = body.error ?? `Publish failed (HTTP ${res.status})`;
      setModalOpen(false);
      setState({ kind: 'failed', error: message, canRetry: true });
      throw new Error(message);
    },
    [applicationId]
  );

  // Compute the button element for the current state. Rendered below
  // alongside the shared OperationLogsDrawer affordance so every state
  // (including failed/signing-in) can access logs without a rewrite per
  // branch.
  let buttonEl: React.ReactNode;
  if (state.kind === 'has-remote') {
    buttonEl = (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(baseClass, interactiveHover, 'text-foreground/80', className)}
        title="Open GitHub repository"
      >
        <GitHubIcon className="size-3" />
        <span className="max-w-[14ch] truncate">{state.url.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="size-3" />
      </a>
    );
  } else if (state.kind === 'loading') {
    buttonEl = (
      <button type="button" disabled className={cn(baseClass, 'cursor-wait opacity-60', className)}>
        <Loader2 className="size-3 animate-spin" />
        <span>Publish to GitHub</span>
      </button>
    );
  } else if (state.kind === 'not-signed-in') {
    buttonEl = (
      <button
        type="button"
        onClick={runSignIn}
        disabled={disabled}
        className={cn(
          baseClass,
          'border-primary text-primary hover:bg-primary/10 cursor-pointer',
          className
        )}
        title="Sign in with GitHub to enable publishing"
      >
        <GitHubIcon className="size-3" />
        <span>Sign in with GitHub</span>
      </button>
    );
  } else if (state.kind === 'signing-in') {
    buttonEl = (
      <button
        type="button"
        disabled
        className={cn(baseClass, 'border-primary text-primary cursor-wait', className)}
        title="Waiting for the GitHub sign-in to complete"
      >
        <Loader2 className="size-3 animate-spin" />
        <span>Waiting for sign-in…</span>
      </button>
    );
  } else if (state.kind === 'failed') {
    buttonEl = (
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={disabled}
        className={cn(
          baseClass,
          'border-destructive text-destructive hover:bg-destructive/10 cursor-pointer',
          className
        )}
        title="Retry publishing — full details available in the operation logs"
      >
        <TriangleAlert className="size-3" />
        <span>Retry publish</span>
      </button>
    );
  } else {
    // state.kind === 'ready'
    buttonEl = (
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={disabled}
        className={cn(baseClass, interactiveHover, className)}
        title="Publish this app to GitHub"
      >
        <GitBranch className="size-3" />
        <span>Publish to GitHub</span>
      </button>
    );
  }

  const logsIconState: OperationLogsIconState =
    state.kind === 'signing-in'
      ? 'running'
      : state.kind === 'failed'
        ? 'failed'
        : state.kind === 'has-remote'
          ? 'success'
          : 'idle';

  // The logs affordance is intentionally hidden in the two earliest states
  // (loading / not-signed-in) where there's nothing meaningful to show yet.
  const showLogsAffordance =
    state.kind === 'failed' || state.kind === 'has-remote' || state.kind === 'signing-in';

  return (
    <div className="inline-flex items-center gap-1">
      {buttonEl}
      {showLogsAffordance ? (
        <OperationLogsIconButton
          state={logsIconState}
          onClick={() => setLogsOpen(true)}
          label="View publish logs"
        />
      ) : null}

      {state.kind === 'ready' ? (
        <PublishToGitHubModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          owners={state.owners}
          defaultRepoName={defaultRepoName}
          onSubmit={runPublish}
        />
      ) : null}

      <OperationLogsDrawer
        open={logsOpen}
        onOpenChange={setLogsOpen}
        kind="GitRemoteCreate"
        operationId={applicationId}
        title="Publish to GitHub logs"
        subtitle={defaultRepoName}
        isRunning={state.kind === 'signing-in'}
      />
    </div>
  );
}
