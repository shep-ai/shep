'use client';

/**
 * SmartDeployCluster — wires the SmartDeployButton + DeployPanel + their
 * supporting hooks into a single drop-in component for the app top bar.
 *
 * Lives as its own file so app-top-bar.tsx stays a thin layout file —
 * all the state-machine glue (git status polling, sync mutation, cloud
 * deploy refresh, modal opens) is encapsulated here.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApplicationStatus,
  CloudDeploymentProvider,
  type Application,
} from '@shepai/core/domain/generated/output';
import type { useCloudDeployAction } from '@/hooks/use-cloud-deploy-action';
import { useGitStatus } from '@/hooks/use-git-status';
import { useSyncAction } from '@/hooks/use-sync-action';
import { useSmartDeployState } from '@/hooks/use-smart-deploy-state';
import { SmartDeployButton } from './smart-deploy-button';
import { DeployPanel } from './deploy-panel';
import { SmartDeployLogsDrawer } from './smart-deploy-logs-drawer';
import { ConnectProviderModal } from './connect-provider-modal';
import { PublishToGitHubModal, type PublishOwner } from './publish-to-github-modal';

const PROVIDER_DISPLAY_NAMES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'Cloudflare Pages',
  [CloudDeploymentProvider.Vercel]: 'Vercel',
  [CloudDeploymentProvider.Netlify]: 'Netlify',
  [CloudDeploymentProvider.AwsAmplify]: 'AWS Amplify',
  [CloudDeploymentProvider.GcpCloudRun]: 'Google Cloud Run',
};

interface ProviderListEntry {
  id: CloudDeploymentProvider;
  displayName: string;
  enabled: boolean;
  connected: boolean;
}

export interface SmartDeployClusterProps {
  application: Application;
  /** Cloud deploy action API hoisted in the parent so the right-pane and
   *  the top-bar share a single instance. */
  cloudDeploy: ReturnType<typeof useCloudDeployAction>;
  /** When the agent is mid-run we disable destructive actions. */
  agentRunning: boolean;
}

export function SmartDeployCluster({
  application,
  cloudDeploy,
  agentRunning,
}: SmartDeployClusterProps) {
  const {
    status: gitStatus,
    loading: gitStatusLoading,
    refresh: refreshGitStatus,
  } = useGitStatus(application.id);
  const sync = useSyncAction(application.id);

  // Cloud provider list — needed for the panel's "switch service" affordance
  // and for the smart-state hook's hasConnectedCloudProvider input.
  const [providers, setProviders] = useState<ProviderListEntry[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const refreshProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/cloud-providers');
      if (!res.ok) return;
      const body = (await res.json()) as { providers: ProviderListEntry[] };
      setProviders(body.providers);
      setProvidersLoaded(true);
    } catch {
      // best-effort; smart-state will treat no providers as "no cloud"
    }
  }, []);
  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const hasConnectedCloudProvider = providersLoaded
    ? providers.some((p) => p.enabled && p.connected)
    : Boolean(application.cloudDeploymentProvider);

  // GitHub owner list — populated lazily when the user opens the
  // first-time-publish modal. Cached so re-opening the modal doesn't
  // re-fetch.
  const [owners, setOwners] = useState<PublishOwner[] | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const ensureOwners = useCallback(async () => {
    if (owners !== null) return;
    try {
      const res = await fetch('/api/cloud-providers/github/orgs');
      if (!res.ok) return;
      const body = (await res.json()) as { owners: PublishOwner[] };
      setOwners(body.owners);
    } catch {
      // surface via the publish modal's own error path
    }
  }, [owners]);

  // Connect-provider modal (token paste) — reuses the existing modal.
  const [connectingProvider, setConnectingProvider] = useState<CloudDeploymentProvider | null>(
    null
  );
  const [connectMode, setConnectMode] = useState<'connect' | 'update'>('connect');

  // Unified Smart Deploy activity log drawer. Replaces the per-op-kind
  // drawer — now a single timeline that merges GitRemoteCreate,
  // CloudDeploy, and RepoSync entries sorted by createdAt so the user
  // reads the whole story in one place. The log button on the right
  // edge of the SmartDeployButton toggles this, and every primary
  // action auto-opens it so the pipeline is never invisible.
  const [logsOpen, setLogsOpen] = useState<boolean>(false);

  // Popover panel open state — lifted here (instead of inside
  // SmartDeployButton) so the primary-click handler for the `getOnline`
  // state can open the panel programmatically. Gives the user the full
  // "pick Save & backup OR Publish to web" choice on first click,
  // rather than forcing them through the GitHub modal.
  const [panelOpen, setPanelOpen] = useState<boolean>(false);

  // One-click "Get online" pipeline guard. Set to true for the entire
  // duration of the create-repo + auto-deploy sequence so
  // `useSmartDeployState` can lock the label on "Getting online…" from
  // click to success — no flickering through intermediate `deploy` /
  // `save` states between API calls.
  const [oneClickRunning, setOneClickRunning] = useState<boolean>(false);

  // Friendly cloud-provider display name. Computed up here (rather than
  // near the render) so `useSmartDeployState` can use it to produce a
  // specific "Deploying to Cloudflare Pages" label instead of a generic
  // "Working…" while a cloud deploy is in flight.
  const cloudProviderName: string | null = (() => {
    const selectedId = cloudDeploy.state.provider;
    if (selectedId) return PROVIDER_DISPLAY_NAMES[selectedId];
    const firstConnected = providers.find((p) => p.connected && p.enabled);
    if (firstConnected) return firstConnected.displayName;
    return null;
  })();

  // Smart state — single source of truth for the button label. Pass the
  // persisted Application.gitRemoteUrl so the state machine can render a
  // real label even when the live /git/status route is briefly unreachable
  // (dev-mode Turbopack cache crash, network blip, etc.).
  const smartState = useSmartDeployState({
    gitStatus,
    gitStatusLoading,
    persistedRemoteUrl: application.gitRemoteUrl ?? null,
    cloudDeploy,
    syncAction: sync.state,
    hasConnectedCloudProvider,
    cloudProviderName,
    oneClickRunning,
  });

  // ── Action dispatch ────────────────────────────────────────────────
  //
  // Auto-open policy: the logs drawer is intrusive UX, so we only pop it
  // open when the user needs it — i.e. when the operation FAILED. On
  // success the SmartDeployButton's own state machine flips to "Live ✓"
  // and the small icon next to it transitions through running/success
  // states; that's all the feedback a happy path needs. The user can
  // still click "Activity log" inside the panel to read the entries
  // post-hoc.

  // Primary actions do NOT auto-open the unified activity drawer.
  // The in-chat OperationBubble shows a spinning in-progress card
  // while each long-running op is live, and the SmartDeployButton
  // label pins on "Publishing to GitHub…" / "Deploying to
  // Cloudflare Pages…" through `workingSource`. The drawer is an
  // on-demand deep-dive surface — users open it explicitly via
  // the standalone log icon when they want the full cross-op
  // timeline. Auto-opening it on every click buried the in-chat
  // status and felt like the UI was shouting at the user.
  const handleSaveChanges = useCallback(async () => {
    await sync.sync();
    await refreshGitStatus();
  }, [sync, refreshGitStatus]);

  const handlePublishToWeb = useCallback(async () => {
    await cloudDeploy.initiate();
  }, [cloudDeploy]);

  const handleRedeploy = handlePublishToWeb;

  const handleSaveAndPublish = useCallback(async () => {
    await sync.sync();
    await refreshGitStatus();
    if (sync.state.kind === 'failed') return;
    await cloudDeploy.initiate();
  }, [sync, refreshGitStatus, cloudDeploy]);

  const handleSetUpCodeStorage = useCallback(async () => {
    await ensureOwners();
    setPublishModalOpen(true);
  }, [ensureOwners]);

  // Provider list handlers — thread through the panel's ProviderList.
  //
  // onSelectProvider — a connected provider was clicked. Persist the
  // choice on the Application row and immediately run a deploy so the
  // user doesn't have to click Publish to web as a separate step.
  const handleSelectProvider = useCallback(
    async (provider: CloudDeploymentProvider) => {
      await cloudDeploy.selectProvider(provider);
      await cloudDeploy.initiate();
    },
    [cloudDeploy]
  );

  // onConnectProvider — an enabled-but-not-connected provider was
  // clicked (or the user clicked "Connect hosting" with nothing set up).
  // Opens the token-paste modal for that provider.
  const handleConnectProvider = useCallback((provider: CloudDeploymentProvider) => {
    setConnectMode('connect');
    setConnectingProvider(provider);
  }, []);

  // onEditConnection — pencil icon on a connected provider row. Opens
  // the same modal in "update token" mode.
  const handleEditConnection = useCallback((provider: CloudDeploymentProvider) => {
    setConnectMode('update');
    setConnectingProvider(provider);
  }, []);

  const handleOpenLogs = useCallback(() => {
    setLogsOpen(true);
  }, []);

  const handleOpenInGitHub = useCallback(() => {
    if (gitStatus?.remoteUrl) {
      const href = gitStatus.remoteUrl.startsWith('http')
        ? gitStatus.remoteUrl.replace(/\.git$/, '')
        : null;
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, [gitStatus]);

  // One-click "Get online" pipeline. Best-effort end-to-end:
  //   1. If GitHub owners haven't been loaded yet, fetch them.
  //   2. If the repo has no git remote yet, create one against the
  //      user's default owner using the slugified application name.
  //      Any failure here (HTTP 409 on name collision, network blip)
  //      is surfaced via the logs drawer but does NOT abort the
  //      pipeline — the cloud deploy can still run off a local-only
  //      repo in some provider configurations.
  //   3. If at least one cloud provider is connected, pick the first
  //      one (or the already-selected one) and fire a deploy.
  //   4. If NO cloud provider is connected, we've done half the work
  //      (the remote now exists) — open the panel so the user can
  //      connect a provider in one more click.
  //
  // Throughout, `oneClickRunning` stays true so the button label is
  // pinned on "Getting online…" and the transition to `live` is a
  // single, clean flip at the end.
  const handleGetOnline = useCallback(async () => {
    if (oneClickRunning || agentRunning) return;
    setOneClickRunning(true);

    // Zero-brain policy: the pipeline defaults everything and only
    // stops if a TOKEN is genuinely required. In both "no GitHub"
    // and "no cloud provider" cases we open the appropriate inline
    // connect modal — NOT the panel, NOT a toast — so the user's
    // next click is literally "paste token and hit Connect". On
    // token submission the state recomputes and the next click runs
    // the pipeline end-to-end.
    //
    // The activity drawer opens only when real work is about to
    // run, so token-prompt paths don't flash an empty "No activity
    // yet" drawer on the user's screen.
    try {
      await ensureOwners();

      // 1. GitHub token gate. Empty owners ⇒ no token on file.
      //    The publish modal owns the GitHub connect + owner-picker
      //    flow so we defer to it here; once the user submits,
      //    owners repopulate and the next Get Online click runs.
      const ownersSnapshot = owners;
      if (!ownersSnapshot || ownersSnapshot.length === 0) {
        setPublishModalOpen(true);
        return;
      }

      // 2. Cloud provider token gate. Pick the first enabled
      //    provider; if none of them are connected we need a token.
      //    Default target = first enabled provider (typically
      //    Cloudflare Pages). The panel chevron still lets the
      //    user pick a different one if they prefer.
      const connectedProvider = providers.find((p) => p.enabled && p.connected);
      if (!connectedProvider) {
        const defaultProvider = providers.find((p) => p.enabled) ?? null;
        if (defaultProvider) {
          setConnectMode('connect');
          setConnectingProvider(defaultProvider.id);
          return;
        }
        // Provider catalog is empty — edge case, fall back to the
        // panel so the user can see SOMETHING actionable.
        setPanelOpen(true);
        return;
      }

      // 3. Both tokens are on file → run the full pipeline
      //    end-to-end with defaults. Progress is visible via the
      //    in-chat OperationBubble (spinning in-progress card) and
      //    the SmartDeployButton label ("Getting online…") — no
      //    auto-opened drawer.
      const hasRemoteNow = gitStatus?.hasRemote === true || Boolean(application.gitRemoteUrl);
      if (!hasRemoteNow) {
        const firstOwner = ownersSnapshot[0];
        const defaultRepoName = application.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        try {
          const res = await fetch(`/api/applications/${application.id}/git/create-remote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ownerLogin: firstOwner.login,
              repoName: defaultRepoName,
              visibility: 'private',
            }),
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            toast.error('GitHub publish failed', {
              description: body.error ?? `HTTP ${res.status}`,
            });
          }
        } catch (err) {
          toast.error('GitHub publish failed', {
            description: err instanceof Error ? err.message : 'Network error',
          });
        }
        await refreshGitStatus();
      }

      if (!cloudDeploy.state.provider || cloudDeploy.state.provider !== connectedProvider.id) {
        await cloudDeploy.selectProvider(connectedProvider.id);
      }
      await cloudDeploy.initiate();
    } finally {
      setOneClickRunning(false);
    }
  }, [
    oneClickRunning,
    agentRunning,
    ensureOwners,
    gitStatus,
    owners,
    application.id,
    application.name,
    application.gitRemoteUrl,
    refreshGitStatus,
    providers,
    cloudDeploy,
  ]);

  // Primary-click dispatch table — drives the left-half of the split button.
  const handlePrimaryClick = useCallback(() => {
    if (agentRunning) return;
    switch (smartState.kind) {
      case 'pushAndDeploy':
        void handleSaveAndPublish();
        return;
      case 'saveAndRepublish':
        // Site is already live but user has local drift. The one-click
        // action is: commit & push the changes, then redeploy to the
        // connected cloud provider — same pipeline as pushAndDeploy.
        void handleSaveAndPublish();
        return;
      case 'save':
        void handleSaveChanges();
        return;
      case 'deploy':
        void handlePublishToWeb();
        return;
      case 'live':
        if (cloudDeploy.state.url) {
          window.open(cloudDeploy.state.url, '_blank', 'noopener,noreferrer');
        }
        return;
      case 'getOnline':
        // One-click "Get online" — create repo + auto-deploy as a
        // single pipeline, best effort. The button label is pinned
        // on "Getting online…" throughout via `oneClickRunning` so
        // the user sees a single smooth transition from click to
        // live, not a sequence of intermediate state flashes. The
        // chevron still opens the full panel for advanced control.
        void handleGetOnline();
        return;
      case 'failed':
        // Retry whichever side failed.
        if (smartState.failedSource === 'sync') void handleSaveChanges();
        else void handlePublishToWeb();
        return;
      default:
        // working / loading — no-op (button is disabled visually)
        return;
    }
  }, [
    agentRunning,
    smartState,
    cloudDeploy.state.url,
    handleSaveAndPublish,
    handleSaveChanges,
    handlePublishToWeb,
    handleGetOnline,
  ]);

  // First-time publish flow — wraps the existing PublishToGitHubModal.
  const handlePublishSubmit = useCallback(
    async (input: { ownerLogin: string; repoName: string; visibility: 'public' | 'private' }) => {
      const res = await fetch(`/api/applications/${application.id}/git/create-remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Publish failed (HTTP ${res.status})`);
      }
      setPublishModalOpen(false);
      await refreshGitStatus();
      // No auto-open drawer — the in-chat OperationBubble shows
      // the publish progress; users can click the standalone log
      // icon if they want the full log.
    },
    [application.id, refreshGitStatus]
  );

  // Connect-cloud-provider modal — reuses the existing flow for token paste.
  const handleConnectSubmit = useCallback(
    async (provider: CloudDeploymentProvider, token: string) => {
      await cloudDeploy.connect(provider, token);
      await refreshProviders();
      await cloudDeploy.selectProvider(provider);
    },
    [cloudDeploy, refreshProviders]
  );

  // Last-deployed time-ago — cheap client-side derivation.
  const lastDeployedAgo = formatTimeAgo(cloudDeploy.state.lastDeployedAt);

  return (
    <>
      {/* Standalone icon-only activity-log button, detached from the
          Smart Deploy split. Native toolbar icon-button style — matches
          the overflow-menu trigger so the whole right cluster reads as
          a single family. */}
      <button
        type="button"
        aria-label="Open activity log"
        title="Smart Deploy activity log"
        onClick={handleOpenLogs}
        className="text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 focus-visible:ring-ring mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-transparent transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none"
      >
        <ScrollText className="size-4" />
      </button>
      <SmartDeployButton
        state={smartState}
        onPrimaryClick={handlePrimaryClick}
        panelOpen={panelOpen}
        onPanelOpenChange={setPanelOpen}
        panel={
          <DeployPanel
            state={smartState}
            gitStatus={gitStatus}
            cloudDeploy={cloudDeploy}
            cloudProviderName={cloudProviderName}
            lastDeployedAgo={lastDeployedAgo}
            providers={providers}
            providersLoading={!providersLoaded}
            providersError={null}
            publishOwners={owners}
            publishDefaultRepoName={application.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')}
            onPublishSubmit={handlePublishSubmit}
            onSaveChanges={handleSaveChanges}
            onPublishToWeb={handlePublishToWeb}
            onRedeploy={handleRedeploy}
            onSetUpCodeStorage={handleSetUpCodeStorage}
            onSelectProvider={(p) => void handleSelectProvider(p)}
            onConnectProvider={handleConnectProvider}
            onEditConnection={handleEditConnection}
            onOpenLogs={handleOpenLogs}
            onOpenInGitHub={handleOpenInGitHub}
          />
        }
      />

      {/* Unified Smart Deploy activity drawer — a single chronological
          timeline merging GitRemoteCreate + CloudDeploy + RepoSync
          logs. Replaces the old per-kind drawer so the user never
          has to guess which scope the currently-open log belongs to. */}
      <SmartDeployLogsDrawer
        open={logsOpen}
        onOpenChange={setLogsOpen}
        applicationId={application.id}
        isRunning={
          smartState.kind === 'working' ||
          oneClickRunning ||
          (!application.setupComplete && application.status !== ApplicationStatus.Error)
        }
        subtitle={cloudProviderName ?? undefined}
      />

      {/* First-time publish modal */}
      {owners ? (
        <PublishToGitHubModal
          open={publishModalOpen}
          onOpenChange={setPublishModalOpen}
          owners={owners}
          defaultRepoName={application.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')}
          onSubmit={handlePublishSubmit}
        />
      ) : null}

      {/* Connect / update cloud token modal */}
      <ConnectProviderModal
        provider={connectingProvider}
        mode={connectMode}
        onClose={() => setConnectingProvider(null)}
        onSubmit={handleConnectSubmit}
      />
    </>
  );
}

function formatTimeAgo(date: Date | null): string | null {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}
