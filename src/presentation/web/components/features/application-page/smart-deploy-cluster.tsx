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
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  type Application,
} from '@shepai/core/domain/generated/output';
import type { useCloudDeployAction } from '@/hooks/use-cloud-deploy-action';
import { useGitStatus } from '@/hooks/use-git-status';
import { useSyncAction } from '@/hooks/use-sync-action';
import { useSmartDeployState } from '@/hooks/use-smart-deploy-state';
import { SmartDeployButton } from './smart-deploy-button';
import { DeployPanel } from './deploy-panel';
import { OperationLogsDrawer } from './operation-logs-drawer';
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

type LogsTarget = { kind: 'CloudDeploy' | 'GitRemoteCreate' | 'RepoSync'; title: string } | null;

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

  // Operation logs drawer — opens on the right side, scoped per op kind.
  const [logsTarget, setLogsTarget] = useState<LogsTarget>(null);

  // Popover panel open state — lifted here (instead of inside
  // SmartDeployButton) so the primary-click handler for the `getOnline`
  // state can open the panel programmatically. Gives the user the full
  // "pick Save & backup OR Publish to web" choice on first click,
  // rather than forcing them through the GitHub modal.
  const [panelOpen, setPanelOpen] = useState<boolean>(false);

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

  const handleSaveChanges = useCallback(async () => {
    await sync.sync();
    await refreshGitStatus();
    if (sync.state.kind === 'failed') {
      setLogsTarget({ kind: 'RepoSync', title: 'Save & backup' });
    }
  }, [sync, refreshGitStatus]);

  const handlePublishToWeb = useCallback(async () => {
    await cloudDeploy.initiate();
    if (cloudDeploy.state.status === CloudDeploymentStatus.Failed) {
      setLogsTarget({ kind: 'CloudDeploy', title: 'Publish to web' });
    }
  }, [cloudDeploy]);

  const handleRedeploy = handlePublishToWeb;

  const handleSaveAndPublish = useCallback(async () => {
    await sync.sync();
    await refreshGitStatus();
    if (sync.state.kind === 'failed') {
      // Sync side blew up — open the drawer and stop here.
      setLogsTarget({ kind: 'RepoSync', title: 'Save & publish everything' });
      return;
    }
    await cloudDeploy.initiate();
    if (cloudDeploy.state.status === CloudDeploymentStatus.Failed) {
      setLogsTarget({ kind: 'CloudDeploy', title: 'Save & publish everything' });
    }
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
      if (cloudDeploy.state.status === CloudDeploymentStatus.Failed) {
        setLogsTarget({ kind: 'CloudDeploy', title: 'Publish to web' });
      }
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
    setLogsTarget({ kind: 'CloudDeploy', title: 'Activity log' });
  }, []);

  const handleOpenInGitHub = useCallback(() => {
    if (gitStatus?.remoteUrl) {
      const href = gitStatus.remoteUrl.startsWith('http')
        ? gitStatus.remoteUrl.replace(/\.git$/, '')
        : null;
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, [gitStatus]);

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
        // Don't force the user through the GitHub flow — opening the
        // panel lets them pick Save & backup OR Publish to web (or
        // Connect hosting) independently. Deploying doesn't actually
        // require a git remote; the old "Get online → GitHub modal"
        // shortcut was biased toward one path and blocked the other.
        setPanelOpen(true);
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
      setLogsTarget({ kind: 'GitRemoteCreate', title: 'Set up code backup' });
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

  // Friendly cloud-provider display name for the panel header.
  const cloudProviderName: string | null = (() => {
    const selectedId = cloudDeploy.state.provider;
    if (selectedId) return PROVIDER_DISPLAY_NAMES[selectedId];
    const firstConnected = providers.find((p) => p.connected && p.enabled);
    if (firstConnected) return firstConnected.displayName;
    return null;
  })();

  // Last-deployed time-ago — cheap client-side derivation.
  const lastDeployedAgo = formatTimeAgo(cloudDeploy.state.lastDeployedAt);

  return (
    <>
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

      {/* Logs drawer — single instance, opened with the right scope by
          whichever action fired last. */}
      <OperationLogsDrawer
        open={logsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLogsTarget(null);
        }}
        kind={(logsTarget?.kind ?? 'CloudDeploy') as 'CloudDeploy' | 'GitRemoteCreate'}
        operationId={application.id}
        title={logsTarget?.title ?? 'Activity log'}
        subtitle={cloudProviderName ?? undefined}
        isRunning={smartState.kind === 'working'}
      />

      {/* First-time publish modal */}
      {owners ? (
        <PublishToGitHubModal
          open={publishModalOpen}
          onOpenChange={setPublishModalOpen}
          owners={owners}
          defaultRepoName={application.slug}
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
