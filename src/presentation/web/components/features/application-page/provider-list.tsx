'use client';

/**
 * ProviderList — inline list of cloud deployment providers rendered
 * inside the DeployPanel's "Live website" section.
 *
 * This restores the "here are all 5 providers + which is connected +
 * Coming soon" surface that the old top-bar DeployButton had as a
 * nested DropdownMenu. Flattening it into the panel (instead of a
 * nested popover) gives the non-technical target user an immediate,
 * scannable picture of where they can deploy — no extra click needed
 * to see the menu.
 *
 * Row interaction model (mirrors the old ProviderDropdown one-for-one):
 *
 *   - Connected   → click deploys immediately (via onSelectConnected).
 *                   Pencil icon on the right opens the update-token
 *                   modal via onEditConnection.
 *   - Enabled but not connected → click opens the connect-token modal
 *                   via onSelectDisconnected.
 *   - Coming soon (enabled=false) → row is disabled, cursor-not-allowed.
 */

import { Pencil } from 'lucide-react';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { CLOUD_PROVIDER_ICONS } from './cloud-provider-icons';

export interface ProviderListEntry {
  id: CloudDeploymentProvider;
  displayName: string;
  enabled: boolean;
  connected: boolean;
}

export interface ProviderListProps {
  providers: readonly ProviderListEntry[];
  selectedProvider: CloudDeploymentProvider | null;
  loading?: boolean;
  loadError?: string | null;
  onSelectConnected(provider: CloudDeploymentProvider): void;
  onSelectDisconnected(provider: CloudDeploymentProvider): void;
  onEditConnection?(provider: CloudDeploymentProvider): void;
}

export function ProviderList({
  providers,
  selectedProvider,
  loading = false,
  loadError = null,
  onSelectConnected,
  onSelectDisconnected,
  onEditConnection,
}: ProviderListProps) {
  if (loading) {
    return <div className="text-muted-foreground px-2 py-1.5 text-[11px]">Loading providers…</div>;
  }
  if (loadError) {
    return <div className="text-destructive px-2 py-1.5 text-[11px]">{loadError}</div>;
  }
  if (providers.length === 0) {
    return (
      <div className="text-muted-foreground px-2 py-1.5 text-[11px]">No providers available</div>
    );
  }

  return (
    <ul className="divide-border/50 border-border/50 flex flex-col divide-y overflow-hidden rounded-md border">
      {providers.map((provider) => {
        const Icon = CLOUD_PROVIDER_ICONS[provider.id];
        const disabled = !provider.enabled;
        const selected = provider.id === selectedProvider;

        const badgeLabel = disabled
          ? 'Coming soon'
          : provider.connected
            ? 'Connected'
            : 'Not connected';
        const badgeClass = disabled
          ? 'text-muted-foreground'
          : provider.connected
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400';

        return (
          <li key={provider.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                if (provider.connected) {
                  onSelectConnected(provider.id);
                } else {
                  onSelectDisconnected(provider.id);
                }
              }}
              className={cn(
                'group flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] transition-colors',
                disabled && 'text-muted-foreground cursor-not-allowed',
                !disabled && 'hover:bg-accent cursor-pointer',
                // Subtle highlight on the currently-selected provider so the
                // user can see at a glance which one will deploy when they
                // click "Publish to web" below.
                !disabled && selected && 'bg-primary/5'
              )}
            >
              <Icon className={cn('size-4 shrink-0', disabled && 'opacity-50')} />
              <span className="min-w-0 flex-1 truncate font-medium">{provider.displayName}</span>
              <span
                className={cn(
                  'shrink-0 text-[10px] tracking-wide whitespace-nowrap uppercase',
                  badgeClass
                )}
              >
                {badgeLabel}
              </span>
              {selected && !disabled ? (
                <span className="text-primary ml-1 text-[10px]" aria-label="Selected">
                  ●
                </span>
              ) : null}
              {provider.enabled && provider.connected && onEditConnection ? (
                // Nested button inside the row; stopPropagation prevents
                // the outer row click from also firing a deploy.
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Update ${provider.displayName} token`}
                  title="Update token"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEditConnection(provider.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onEditConnection(provider.id);
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground hover:bg-background ml-1 inline-flex size-5 cursor-pointer items-center justify-center rounded"
                >
                  <Pencil className="size-3" />
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
