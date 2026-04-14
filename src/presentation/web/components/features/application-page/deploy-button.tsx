'use client';

/**
 * DeployButton — split-button cloud deploy control for the application top bar.
 *
 *   - Left half: icon of the currently-selected provider + label
 *     reflecting the lifecycle state (NotDeployed → Deploy,
 *     Uploading/Deploying → Deploying…, Deployed → live-URL chip,
 *     Failed → Retry).
 *   - Right half: chevron that opens the provider dropdown. The
 *     dropdown lists every known provider (enabled + disabled stubs).
 *     Selecting an enabled-but-not-connected provider opens the
 *     ConnectProviderModal before running Deploy.
 *
 * This component is purely presentational over the `useCloudDeployAction`
 * hook and the `/api/cloud-providers` list — no business logic lives here.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
} from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { CLOUD_PROVIDER_ICONS } from './cloud-provider-icons';
import { ProviderDropdown, type CloudProviderListEntry } from './provider-dropdown';
import { ConnectProviderModal } from './connect-provider-modal';
import { OperationLogsDrawer } from './operation-logs-drawer';
import { OperationLogsIconButton, type OperationLogsIconState } from './operation-logs-icon-button';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';

export interface DeployButtonProps {
  deploy: CloudDeployActionApi;
  /** Application id — needed to scope the operation logs drawer. */
  applicationId?: string;
  /** Application slug — shown as the drawer subtitle. */
  applicationSlug?: string;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_PROVIDER: CloudDeploymentProvider = CloudDeploymentProvider.CloudflarePages;

const PROVIDER_FALLBACK_NAMES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'Cloudflare Pages',
  [CloudDeploymentProvider.Vercel]: 'Vercel',
  [CloudDeploymentProvider.Netlify]: 'Netlify',
  [CloudDeploymentProvider.AwsAmplify]: 'AWS Amplify',
  [CloudDeploymentProvider.GcpCloudRun]: 'Google Cloud Run',
};

/** Compact names used in the top-bar Deploy button so it doesn't blow out
 *  the row. The dropdown still uses the full displayName. */
const PROVIDER_SHORT_NAMES: Record<CloudDeploymentProvider, string> = {
  [CloudDeploymentProvider.CloudflarePages]: 'Cloudflare',
  [CloudDeploymentProvider.Vercel]: 'Vercel',
  [CloudDeploymentProvider.Netlify]: 'Netlify',
  [CloudDeploymentProvider.AwsAmplify]: 'Amplify',
  [CloudDeploymentProvider.GcpCloudRun]: 'Cloud Run',
};

function statusLabel(status: CloudDeploymentStatus, providerShortName: string): string {
  switch (status) {
    case CloudDeploymentStatus.Building:
      return 'Building…';
    case CloudDeploymentStatus.Uploading:
      return 'Uploading…';
    case CloudDeploymentStatus.Deploying:
      return 'Deploying…';
    case CloudDeploymentStatus.Deployed:
      return 'Deployed';
    case CloudDeploymentStatus.Failed:
      return `Retry → ${providerShortName}`;
    default:
      return `Deploy → ${providerShortName}`;
  }
}

export function DeployButton({
  deploy,
  applicationId,
  applicationSlug,
  disabled,
  className,
}: DeployButtonProps) {
  const [providers, setProviders] = useState<CloudProviderListEntry[]>([]);
  const [providersLoading, setProvidersLoading] = useState<boolean>(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<CloudDeploymentProvider | null>(
    null
  );
  const [connectMode, setConnectMode] = useState<'connect' | 'update'>('connect');
  const isDisabled = Boolean(disabled);

  async function refreshProviders() {
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const res = await fetch('/api/cloud-providers');
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setProvidersError(typeof detail.error === 'string' ? detail.error : `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as { providers: CloudProviderListEntry[] };
      setProviders(body.providers);
    } catch (err) {
      setProvidersError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setProvidersLoading(false);
    }
  }

  useEffect(() => {
    void refreshProviders();
  }, []);

  const selectedProvider = deploy.state.provider ?? DEFAULT_PROVIDER;
  const Icon = CLOUD_PROVIDER_ICONS[selectedProvider];
  const { status, url, isWorking } = deploy.state;

  const [selectError, setSelectError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  async function runDeploy() {
    if (isWorking || isDisabled) return;
    // If there's no provider selected yet, default to Cloudflare Pages.
    const providerToUse = deploy.state.provider ?? DEFAULT_PROVIDER;
    const info = providers.find((p) => p.id === providerToUse);
    if (info && !info.enabled) return;
    if (info && !info.connected) {
      setConnectMode('connect');
      setConnectingProvider(providerToUse);
      return;
    }
    setSelectError(null);
    try {
      await deploy.selectProvider(providerToUse);
    } catch (err) {
      // Persist the failure into deploy state so the button surfaces it the
      // same way as an initiate failure (red border + tooltip).
      setSelectError(err instanceof Error ? err.message : 'Failed to select provider');
      return;
    }
    await deploy.initiate();
  }

  async function handleSelectEnabled(provider: CloudDeploymentProvider) {
    // Just update the selection — the user clicks the main Deploy button to
    // actually run a deployment. Selecting a provider should never side-effect
    // a deploy, otherwise users can't change provider without committing to
    // a run.
    setSelectError(null);
    try {
      await deploy.selectProvider(provider);
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : 'Failed to select provider');
    }
  }

  async function handleConnect(provider: CloudDeploymentProvider, token: string) {
    await deploy.connect(provider, token);
    await refreshProviders();
    await deploy.selectProvider(provider);
  }

  const baseClass =
    'h-7 px-2 border rounded-md text-[11px] inline-flex items-center gap-1 transition-colors';
  const interactiveHover = 'hover:bg-accent hover:text-accent-foreground';

  const selectedProviderInfo = providers.find((p) => p.id === selectedProvider);
  // Tooltip uses the full display name for clarity; the visible label uses
  // the compact short name so the top-bar button stays narrow.
  const selectedProviderFullName =
    selectedProviderInfo?.displayName ?? PROVIDER_FALLBACK_NAMES[selectedProvider];
  const selectedProviderShortName = PROVIDER_SHORT_NAMES[selectedProvider];
  const label = statusLabel(status, selectedProviderShortName);
  const isDeployed = status === CloudDeploymentStatus.Deployed && url;
  const hasConnectedProvider = providers.some((p) => p.enabled && p.connected);
  // The action button is gated until at least one provider is connected.
  // The chevron stays interactive so users can connect a provider from the
  // dropdown — that's the only way out of the gated state.
  const gatedReason = !hasConnectedProvider
    ? 'Connect a cloud provider first — open the chevron menu →'
    : null;
  const actionDisabled = isDisabled || isWorking || providersLoading || gatedReason !== null;

  return (
    <div className={cn('inline-flex items-stretch', className)}>
      {/* Main action */}
      <button
        type="button"
        onClick={runDeploy}
        disabled={actionDisabled}
        className={cn(
          baseClass,
          'rounded-r-none border-r-0',
          !actionDisabled && interactiveHover,
          !actionDisabled && 'cursor-pointer',
          status === CloudDeploymentStatus.Failed &&
            !actionDisabled &&
            'border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive',
          isDeployed &&
            'border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950',
          actionDisabled && 'cursor-not-allowed opacity-60'
        )}
        title={gatedReason ?? `Deploy this app to ${selectedProviderFullName}`}
      >
        {isWorking ? (
          <Loader2 className="size-3 animate-spin" />
        ) : status === CloudDeploymentStatus.Failed ? (
          <TriangleAlert className="size-3" />
        ) : (
          <Icon className="size-3" />
        )}
        <span>{label}</span>
      </button>

      {/* URL chip (only when deployed) — mirrors the deployed color stripe. */}
      {isDeployed ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            baseClass,
            'rounded-none border-r-0',
            'cursor-pointer border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950'
          )}
          title="Open deployed site"
        >
          <ExternalLink className="size-3" />
          <span className="max-w-[14ch] truncate">{url.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : null}

      {/* Provider switcher (always interactive — it's the path to connect).
          Mirrors the main action button's status colors so the split-button
          reads as a single visual unit (red on Failed, green when Deployed). */}
      <ProviderDropdown
        trigger={
          <button
            type="button"
            className={cn(
              baseClass,
              'rounded-l-none px-1',
              interactiveHover,
              'cursor-pointer',
              status === CloudDeploymentStatus.Failed &&
                'border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive',
              isDeployed &&
                'border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950',
              gatedReason && 'animate-pulse',
              (isDisabled || isWorking) && 'cursor-not-allowed opacity-60'
            )}
            disabled={isDisabled || isWorking}
            aria-label="Switch cloud deployment provider"
            title={gatedReason ?? 'Switch cloud deployment provider'}
          >
            <ChevronDown className="size-3" />
          </button>
        }
        providers={providers}
        selectedProvider={selectedProvider}
        loading={providersLoading}
        loadError={providersError}
        onSelectEnabled={handleSelectEnabled}
        onSelectDisconnected={(p) => {
          setConnectMode('connect');
          setConnectingProvider(p);
        }}
        onEditConnection={(p) => {
          setConnectMode('update');
          setConnectingProvider(p);
        }}
      />

      {/* ── Operation logs affordance ─────────────────────────────────────
          Subtle info-icon next to the split-button. Only renders when an
          applicationId is provided (which it always will be from the app
          top bar — the prop is optional purely so the Storybook and legacy
          fake mounts keep working without a real app context). */}
      {applicationId ? (
        <>
          <OperationLogsIconButton
            state={computeLogsIconState(status, isWorking, Boolean(selectError))}
            onClick={() => setLogsOpen(true)}
            className="ms-1 self-center"
            label="View deploy logs"
          />
          <OperationLogsDrawer
            open={logsOpen}
            onOpenChange={setLogsOpen}
            kind="CloudDeploy"
            operationId={applicationId}
            title="Cloud deploy logs"
            subtitle={`${selectedProviderFullName}${applicationSlug ? ` · ${applicationSlug}` : ''}`}
            isRunning={isWorking}
          />
        </>
      ) : null}

      <ConnectProviderModal
        provider={connectingProvider}
        mode={connectMode}
        onClose={() => setConnectingProvider(null)}
        onSubmit={async (p, token) => {
          await handleConnect(p, token);
        }}
      />
    </div>
  );
}

function computeLogsIconState(
  status: CloudDeploymentStatus,
  isWorking: boolean,
  hasSelectError: boolean
): OperationLogsIconState {
  if (isWorking) return 'running';
  if (status === CloudDeploymentStatus.Failed || hasSelectError) return 'failed';
  if (status === CloudDeploymentStatus.Deployed) return 'success';
  return 'idle';
}
