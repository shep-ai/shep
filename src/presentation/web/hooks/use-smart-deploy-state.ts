'use client';

/**
 * useSmartDeployState
 *
 * Combines `useGitStatus`, `useCloudDeployAction`, and `useSyncAction`
 * into the single state machine that drives the SmartDeployButton label.
 * Lives as its own hook so the button itself stays purely presentational
 * — and so we can unit-test the state-priority logic without rendering
 * any React tree.
 *
 * Sources of truth for "do we have a remote at all":
 *
 *   1. `persistedRemoteUrl` — the value of `Application.gitRemoteUrl`
 *      from SQLite. Authoritative. If this is set, the app HAS a remote
 *      regardless of what the live `git remote -v` subprocess reports.
 *   2. `gitStatus.hasRemote` — the live read. Drives drift counts only.
 *
 * Mirrors the server-side defense in GetGitStatusUseCase. The reason for
 * BOTH layers is so the button never locks on "Loading…" when the
 * /git/status route is briefly unreachable (dev-mode Turbopack cache
 * crash, network blip, etc.) — the persisted URL gives us a sensible
 * synthetic status so the state machine can still produce a real label.
 *
 * Priority (top wins):
 *   1. Loading — first fetch hasn't completed AND no persisted URL
 *   2. Working — sync OR deploy in flight
 *   3. Failed — sync OR deploy failed
 *   4. SaveAndRepublish — ALREADY deployed AND the user has new local
 *      changes. The site is live but out-of-date — we swap the calm
 *      green "Live" chip for a primary-toned "Save & republish" CTA so
 *      the drift is obvious at a glance and the user knows the one
 *      click they need to make the site match their work again.
 *   5. Live — clean tree, already deployed, no local drift. Wins over
 *      the `!hasRemote → getOnline` guard below so users who publish
 *      to Cloudflare without setting up a git backup still see the
 *      live indicator in the top bar.
 *   6. PushAndDeploy — has dirty changes AND has a connected cloud
 *      (but NOT deployed yet — priority 4 handles the already-live case)
 *   7. Save — has dirty changes, no cloud connected
 *   8. Deploy — clean tree, has remote, not deployed yet
 *   9. GetOnline — first-time setup (no remote AND not deployed)
 */

import { useMemo } from 'react';
import { CloudDeploymentStatus } from '@shepai/core/domain/generated/output';
import type { CloudDeployActionApi } from './use-cloud-deploy-action';
import type { GitStatusDto } from './use-git-status';
import type { SyncActionState } from './use-sync-action';

export type SmartDeployStateKind =
  | 'loading'
  | 'getOnline' // no remote yet — one click runs the full zero-brain pipeline
  | 'connectCloud' // has remote + not deployed + NO cloud provider — click opens the connect modal
  | 'deploy' // clean + has remote + cloud connected, no deployment yet
  | 'save' // dirty + has remote, no cloud connected
  | 'pushAndDeploy' // dirty + has remote + cloud connected (not yet live)
  | 'saveAndRepublish' // dirty + already live — republish needed to catch up
  | 'live' // clean + deployed, no drift
  | 'working' // running (sync or deploy)
  | 'failed'; // last operation failed

export interface SmartDeployState {
  kind: SmartDeployStateKind;
  /** Number of changes (uncommitted + unpushed). Used for badge display. */
  changeCount: number;
  /** True iff the user has connected at least one cloud provider. */
  hasCloud: boolean;
  /** True iff the user has a GitHub remote attached. */
  hasRemote: boolean;
  /** Live URL when in `live` state. */
  liveUrl: string | null;
  /** Last-error message when in `failed` state. */
  errorMessage: string | null;
  /** Source of the failure (so the panel can highlight the right section). */
  failedSource: 'sync' | 'deploy' | null;
  /** Which side is actively running when `kind === 'working'`. Used by
   *  the top-bar button to swap the generic "Working…" label for a
   *  specific one: "Syncing code", "Deploying to Cloudflare Pages", or
   *  the one-click "Getting online…" umbrella that covers the whole
   *  create-repo + auto-deploy pipeline. */
  workingSource: 'sync' | 'deploy' | 'getOnline' | null;
  /** Friendly display name of the cloud provider the deploy targets,
   *  e.g. "Cloudflare Pages". Threaded in from the parent so the
   *  hook doesn't have to own the enum→name mapping. */
  cloudProviderName: string | null;
}

export interface UseSmartDeployStateInput {
  /** Output of useGitStatus. Pass `null` for `status` while still loading. */
  gitStatus: GitStatusDto | null;
  /** True iff useGitStatus has not yet completed its first fetch attempt. */
  gitStatusLoading: boolean;
  /** Persisted Application.gitRemoteUrl — defensive fallback when live
   *  status hasn't loaded or is empty. Set on the Application row when
   *  the publish flow has run successfully. */
  persistedRemoteUrl: string | null;
  /** Output of useCloudDeployAction. */
  cloudDeploy: CloudDeployActionApi;
  /** Output of useSyncAction. */
  syncAction: SyncActionState;
  /** Whether at least one cloud provider is connected. From /api/cloud-providers. */
  hasConnectedCloudProvider: boolean;
  /** Friendly display name of the target cloud provider, e.g.
   *  "Cloudflare Pages". Threaded through so the button label can read
   *  "Deploying to Cloudflare Pages" without the hook owning any
   *  enum→string mapping. Falls through to null when no provider is
   *  picked yet (`Working…` fallback). */
  cloudProviderName: string | null;
  /** True while the one-click "Get online" pipeline is running
   *  (create GitHub remote → refresh git status → auto-deploy to the
   *  connected cloud provider). Forces the state machine to `working`
   *  with `workingSource: 'getOnline'` for the ENTIRE pipeline so the
   *  button label can't flicker between intermediate truths — without
   *  it, the brief window between create-remote completing and
   *  cloudDeploy.initiate() being called would bounce the label
   *  through `deploy`/`save` before landing on `working` again. */
  oneClickRunning?: boolean;
}

export function useSmartDeployState({
  gitStatus,
  gitStatusLoading,
  persistedRemoteUrl,
  cloudDeploy,
  syncAction,
  hasConnectedCloudProvider,
  cloudProviderName,
  oneClickRunning,
}: UseSmartDeployStateInput): SmartDeployState {
  return useMemo(() => {
    // Effective git status — merge live read with persisted remote URL.
    // The smart state never returns "loading" when we have a persisted
    // URL: that's enough information to render a real label even if the
    // /git/status route is briefly unreachable.
    const effectiveStatus: GitStatusDto =
      gitStatus ??
      (persistedRemoteUrl
        ? {
            branch: 'main',
            uncommittedCount: 0,
            unpushedCount: 0,
            hasRemote: true,
            remoteUrl: persistedRemoteUrl,
          }
        : {
            branch: null,
            uncommittedCount: 0,
            unpushedCount: 0,
            hasRemote: false,
            remoteUrl: null,
          });

    // One-click "Get online" pipeline override. The caller lifts this
    // flag for the full duration of the create-repo → deploy pipeline
    // so the label stays on "Getting online…" end-to-end. Without this
    // dominance, the moment create-remote completes and git status
    // refreshes we'd fall through to (e.g.) `deploy` until the cloud
    // call fires a beat later, producing a visible flicker on the
    // user's primary call-to-action.
    if (oneClickRunning) {
      const cloudUrl = cloudDeploy.state.url;
      return baseState({
        kind: 'working',
        hasCloud: hasConnectedCloudProvider,
        hasRemote: gitStatus?.hasRemote ?? persistedRemoteUrl !== null,
        changeCount: (gitStatus?.uncommittedCount ?? 0) + (gitStatus?.unpushedCount ?? 0),
        workingSource: 'getOnline',
        cloudProviderName,
        liveUrl: cloudUrl ?? null,
      });
    }

    // Loading is ONLY the brief window before the first /git/status fetch
    // completes, AND only when we have nothing else to show. Once the
    // first attempt finishes (success OR fail) the button transitions to
    // a real state — never sticks on "Loading…".
    if (gitStatus === null && persistedRemoteUrl === null && gitStatusLoading) {
      return baseState({
        kind: 'loading',
        hasCloud: hasConnectedCloudProvider,
      });
    }

    const hasRemote = effectiveStatus.hasRemote;
    const changeCount = effectiveStatus.uncommittedCount + effectiveStatus.unpushedCount;
    const cloudStatus = cloudDeploy.state.status;
    const cloudUrl = cloudDeploy.state.url;
    const cloudIsWorking = cloudDeploy.state.isWorking;
    const cloudFailed = cloudStatus === CloudDeploymentStatus.Failed;
    const cloudDeployed = cloudStatus === CloudDeploymentStatus.Deployed && Boolean(cloudUrl);

    // 1. Working — sync or deploy in flight. Record which side is
    //    actively running so the button label can say "Syncing code"
    //    or "Deploying to Cloudflare Pages" instead of the generic
    //    "Working…". When both are running (pushAndDeploy pipeline),
    //    the cloud deploy takes longer and is more informative to
    //    surface, so it wins the label.
    if (syncAction.kind === 'running' || cloudIsWorking) {
      return baseState({
        kind: 'working',
        changeCount,
        hasRemote,
        hasCloud: hasConnectedCloudProvider,
        liveUrl: cloudDeployed ? (cloudUrl ?? null) : null,
        workingSource: cloudIsWorking ? ('deploy' as const) : ('sync' as const),
        cloudProviderName,
      });
    }

    // 2. Failed — sync or deploy failed
    if (syncAction.kind === 'failed') {
      return baseState({
        kind: 'failed',
        changeCount,
        hasRemote,
        hasCloud: hasConnectedCloudProvider,
        errorMessage: syncAction.error,
        failedSource: 'sync',
      });
    }
    if (cloudFailed) {
      return baseState({
        kind: 'failed',
        changeCount,
        hasRemote,
        hasCloud: hasConnectedCloudProvider,
        errorMessage: cloudDeploy.state.error ?? 'Deployment failed',
        failedSource: 'deploy',
      });
    }

    // 3. Already deployed + local drift → SaveAndRepublish. The site is
    //    live but the user has edits that aren't up there yet. Promote
    //    the republish CTA over the calm "Live" chip so the drift is
    //    obvious from the top bar without opening the panel. Requires
    //    a remote because the handler does a save-then-publish pipeline;
    //    the remote-less "dirty but live" corner falls through to the
    //    plain Live state and the user can republish via the panel.
    if (cloudDeployed && changeCount > 0 && hasRemote) {
      return baseState({
        kind: 'saveAndRepublish',
        changeCount,
        hasRemote: true,
        hasCloud: hasConnectedCloudProvider,
        liveUrl: cloudUrl ?? null,
      });
    }

    // 4. Already deployed, no drift → Live. Wins over everything below
    //    (including `!hasRemote → getOnline`) so users who published to
    //    Cloudflare without setting up a git backup still see the live
    //    indicator in the top bar. The missing backup is surfaced inside
    //    the panel as a soft "no backup yet" chip, not as a label that
    //    pretends the site isn't online.
    if (cloudDeployed) {
      return baseState({
        kind: 'live',
        changeCount,
        hasRemote,
        hasCloud: hasConnectedCloudProvider,
        liveUrl: cloudUrl ?? null,
      });
    }

    // 4. No remote at all — first-time setup. The button is always
    //    "Get online" regardless of cloud provider connectivity;
    //    the one-click handler walks the whole zero-brain pipeline
    //    and only stops to prompt when a token is actually required.
    if (!hasRemote) {
      return baseState({
        kind: 'getOnline',
        changeCount,
        hasRemote: false,
        hasCloud: hasConnectedCloudProvider,
      });
    }

    // 5. Dirty + cloud connected → Push & Deploy combined action
    if (changeCount > 0 && hasConnectedCloudProvider) {
      return baseState({
        kind: 'pushAndDeploy',
        changeCount,
        hasRemote: true,
        hasCloud: true,
      });
    }

    // 6. Dirty, no cloud → Save changes only
    if (changeCount > 0) {
      return baseState({
        kind: 'save',
        changeCount,
        hasRemote: true,
        hasCloud: false,
      });
    }

    // 7. Clean + not deployed + NO cloud provider → ConnectCloud. The
    //    primary action can't meaningfully be "Publish to web" because
    //    the deploy call would fail with a clear "no provider connected"
    //    error — surface the mandatory connect step up-front so the user
    //    knows what to do before the pipeline runs. Clicking this state
    //    opens the connect modal; after a successful connect the state
    //    machine flips to `deploy` (or `pushAndDeploy`) on its own.
    if (!hasConnectedCloudProvider) {
      return baseState({
        kind: 'connectCloud',
        changeCount: 0,
        hasRemote: true,
        hasCloud: false,
      });
    }

    // 8. Clean + not deployed + cloud connected → Deploy
    return baseState({
      kind: 'deploy',
      changeCount: 0,
      hasRemote: true,
      hasCloud: hasConnectedCloudProvider,
    });
  }, [
    gitStatus,
    gitStatusLoading,
    persistedRemoteUrl,
    cloudDeploy.state,
    syncAction,
    hasConnectedCloudProvider,
    cloudProviderName,
    oneClickRunning,
  ]);
}

function baseState(
  partial: Partial<SmartDeployState> & { kind: SmartDeployStateKind }
): SmartDeployState {
  return {
    kind: partial.kind,
    changeCount: partial.changeCount ?? 0,
    hasCloud: partial.hasCloud ?? false,
    hasRemote: partial.hasRemote ?? false,
    liveUrl: partial.liveUrl ?? null,
    errorMessage: partial.errorMessage ?? null,
    failedSource: partial.failedSource ?? null,
    workingSource: partial.workingSource ?? null,
    cloudProviderName: partial.cloudProviderName ?? null,
  };
}
