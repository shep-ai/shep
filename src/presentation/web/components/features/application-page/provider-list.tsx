'use client';

/**
 * ProviderList — inline list of cloud deployment providers rendered
 * inside the DeployPanel's "Live website" section.
 *
 * Collapsed-by-default surface: shows ONLY the currently-selected
 * provider (or the first enabled+connected one, or the first enabled
 * one as a last resort) with a "Change" chevron button. Clicking the
 * chevron expands the full list so the user can see which other
 * providers exist + which are still "Coming soon". This keeps the
 * panel skimmable — the 80% case is "click Publish on the one provider
 * I'm using" — without hiding the switcher from power users.
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

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { CLOUD_PROVIDER_BRAND_HEX, CLOUD_PROVIDER_ICONS } from './cloud-provider-icons';

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
  // The collapsed view shows the one provider the user cares about. Pick
  // in priority order: (1) explicit selection, (2) first connected, (3)
  // first enabled, (4) first entry. Memoized so the expand/collapse toggle
  // doesn't re-derive this on every render.
  const primary = useMemo(
    () => pickPrimary(providers, selectedProvider),
    [providers, selectedProvider]
  );

  // Collapsed by default — user can expand to see the "Coming soon" lineup
  // and switch providers. Local state; not persisted across opens of the
  // popover because the collapsed view is always the right default.
  const [expanded, setExpanded] = useState(false);

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

  const hasAlternatives = providers.length > 1;
  const visible = expanded ? providers : primary ? [primary] : [];

  return (
    <div className="border-border/50 overflow-hidden rounded-md border">
      <ul className="divide-border/50 flex flex-col divide-y">
        {visible.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            isSelected={provider.id === selectedProvider}
            onSelectConnected={onSelectConnected}
            onSelectDisconnected={onSelectDisconnected}
            onEditConnection={onEditConnection}
          />
        ))}
      </ul>
      {hasAlternatives ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground flex w-full cursor-pointer items-center justify-center gap-1 border-t px-2 py-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              <span>Hide other providers</span>
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              <span>Change provider</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

/** Single row — extracted so the expand/collapse wrapper above reads as a
 *  pure layout file. All interaction logic is the same as before. */
function ProviderRow({
  provider,
  isSelected,
  onSelectConnected,
  onSelectDisconnected,
  onEditConnection,
}: {
  provider: ProviderListEntry;
  isSelected: boolean;
  onSelectConnected(provider: CloudDeploymentProvider): void;
  onSelectDisconnected(provider: CloudDeploymentProvider): void;
  onEditConnection?(provider: CloudDeploymentProvider): void;
}) {
  const Icon = CLOUD_PROVIDER_ICONS[provider.id];
  const brandHex = CLOUD_PROVIDER_BRAND_HEX[provider.id];
  const disabled = !provider.enabled;

  const badgeLabel = disabled ? 'Coming soon' : provider.connected ? 'Connected' : 'Not connected';
  const badgeClass = disabled
    ? 'text-muted-foreground'
    : provider.connected
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-amber-600 dark:text-amber-400';

  return (
    <li>
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
          !disabled && isSelected && 'bg-primary/5'
        )}
      >
        <Icon
          className={cn('size-4 shrink-0', disabled && 'opacity-50')}
          // Render in the real brand color only when enabled. Disabled
          // (Coming soon) rows stay monochrome so they visually recede.
          style={disabled ? undefined : { color: brandHex }}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{provider.displayName}</span>
        <span
          className={cn(
            'shrink-0 text-[10px] tracking-wide whitespace-nowrap uppercase',
            badgeClass
          )}
        >
          {badgeLabel}
        </span>
        {isSelected && !disabled ? (
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
}

/** Pick the single provider to show in the collapsed view. */
function pickPrimary(
  providers: readonly ProviderListEntry[],
  selected: CloudDeploymentProvider | null
): ProviderListEntry | null {
  if (selected) {
    const match = providers.find((p) => p.id === selected);
    if (match) return match;
  }
  const firstConnected = providers.find((p) => p.enabled && p.connected);
  if (firstConnected) return firstConnected;
  const firstEnabled = providers.find((p) => p.enabled);
  if (firstEnabled) return firstEnabled;
  return providers[0] ?? null;
}
