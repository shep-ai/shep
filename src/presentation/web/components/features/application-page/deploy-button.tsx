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
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';

export interface DeployButtonProps {
  deploy: CloudDeployActionApi;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_PROVIDER: CloudDeploymentProvider = CloudDeploymentProvider.CloudflarePages;

function statusLabel(status: CloudDeploymentStatus): string {
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
      return 'Retry deploy';
    default:
      return 'Deploy';
  }
}

export function DeployButton({ deploy, disabled, className }: DeployButtonProps) {
  const [providers, setProviders] = useState<CloudProviderListEntry[]>([]);
  const [connectingProvider, setConnectingProvider] = useState<CloudDeploymentProvider | null>(
    null
  );
  const isDisabled = Boolean(disabled);

  async function refreshProviders() {
    try {
      const res = await fetch('/api/cloud-providers');
      if (!res.ok) return;
      const body = (await res.json()) as { providers: CloudProviderListEntry[] };
      setProviders(body.providers);
    } catch {
      // ignore — button still works with an empty list
    }
  }

  useEffect(() => {
    void refreshProviders();
  }, []);

  const selectedProvider = deploy.state.provider ?? DEFAULT_PROVIDER;
  const Icon = CLOUD_PROVIDER_ICONS[selectedProvider];
  const { status, url, error, isWorking } = deploy.state;

  async function runDeploy() {
    if (isWorking || isDisabled) return;
    // If there's no provider selected yet, default to Cloudflare Pages.
    const providerToUse = deploy.state.provider ?? DEFAULT_PROVIDER;
    const info = providers.find((p) => p.id === providerToUse);
    if (info && !info.enabled) return;
    if (info && !info.connected) {
      setConnectingProvider(providerToUse);
      return;
    }
    await deploy.selectProvider(providerToUse);
    await deploy.initiate();
  }

  async function handleSelectEnabled(provider: CloudDeploymentProvider) {
    await deploy.selectProvider(provider);
    await deploy.initiate();
  }

  async function handleConnect(provider: CloudDeploymentProvider, token: string) {
    await deploy.connect(provider, token);
    await refreshProviders();
    await deploy.selectProvider(provider);
  }

  const baseClass =
    'h-7 px-2 border rounded-md text-[11px] inline-flex items-center gap-1 transition-colors';

  const label = statusLabel(status);
  const isDeployed = status === CloudDeploymentStatus.Deployed && url;

  return (
    <div className={cn('inline-flex items-stretch', className)}>
      {/* Main action */}
      <button
        type="button"
        onClick={runDeploy}
        disabled={isDisabled || isWorking}
        className={cn(
          baseClass,
          'rounded-r-none border-r-0',
          status === CloudDeploymentStatus.Failed && 'border-destructive text-destructive',
          isDeployed && 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
          (isDisabled || isWorking) && 'cursor-not-allowed opacity-60'
        )}
        title={error ?? label}
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

      {/* URL chip (only when deployed) */}
      {isDeployed ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(baseClass, 'rounded-none border-r-0')}
          title="Open deployed site"
        >
          <ExternalLink className="size-3" />
          <span className="max-w-[14ch] truncate">{url.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : null}

      {/* Provider switcher */}
      <ProviderDropdown
        trigger={
          <button
            type="button"
            className={cn(baseClass, 'rounded-l-none px-1')}
            disabled={isDisabled || isWorking}
            aria-label="Switch cloud deployment provider"
          >
            <ChevronDown className="size-3" />
          </button>
        }
        providers={providers}
        selectedProvider={selectedProvider}
        onSelectEnabled={handleSelectEnabled}
        onSelectDisconnected={(p) => setConnectingProvider(p)}
      />

      <ConnectProviderModal
        provider={connectingProvider}
        onClose={() => setConnectingProvider(null)}
        onSubmit={async (p, token) => {
          await handleConnect(p, token);
        }}
      />
    </div>
  );
}
