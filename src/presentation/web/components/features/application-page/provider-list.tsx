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
  /**
   * When true, the currently-selected provider is NEVER rendered as a
   * row — not in the collapsed primary view, not in the expanded list.
   * Used when the parent already renders the selected provider as its
   * own main row (e.g. DeployPanel's cloud host ServiceRow) and we only
   * want the provider list to surface *alternatives*. In that mode the
   * collapsed view is empty and only the "Change provider" chevron
   * shows — clicking it expands the list of other providers.
   */
  hideSelected?: boolean;
  onSelectConnected(provider: CloudDeploymentProvider): void;
  onSelectDisconnected(provider: CloudDeploymentProvider): void;
  onEditConnection?(provider: CloudDeploymentProvider): void;
}

export function ProviderList({
  providers,
  selectedProvider,
  loading = false,
  loadError = null,
  hideSelected = false,
  onSelectConnected,
  onSelectDisconnected,
  onEditConnection,
}: ProviderListProps) {
  // When hideSelected is set we're acting as an inline switcher under
  // a parent row that already shows the current provider. Filter the
  // currently-selected entry out before any of the collapsed / expanded
  // logic runs so we never double-render it.
  const effectiveProviders = useMemo(
    () =>
      hideSelected && selectedProvider
        ? providers.filter((p) => p.id !== selectedProvider)
        : providers,
    [providers, selectedProvider, hideSelected]
  );

  // The collapsed view shows the one provider the user cares about
  // (the "primary"). In hideSelected mode the collapsed view is empty
  // on purpose — the parent owns the main row and this list only
  // surfaces alternatives when the user expands it.
  const primary = useMemo(
    () => (hideSelected ? null : pickPrimary(effectiveProviders, selectedProvider)),
    [effectiveProviders, selectedProvider, hideSelected]
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
  if (effectiveProviders.length === 0) {
    // No alternatives to switch to — don't render anything so the
    // DeployPanel doesn't show an empty "Change provider" toggle that
    // leads nowhere.
    return null;
  }

  // In hideSelected mode the chevron is the only thing visible in the
  // collapsed state — there are always alternatives to reveal because
  // we filtered out the selected one above.
  const hasAlternatives = hideSelected || effectiveProviders.length > 1;
  const visible = expanded ? effectiveProviders : primary ? [primary] : [];

  return (
    <div
      className={cn(
        'overflow-hidden',
        // When we DO render rows (collapsed primary or expanded list)
        // wrap them in a bordered container. In hideSelected mode the
        // collapsed state renders nothing, so skip the border to avoid
        // an empty framed box.
        (visible.length > 0 || expanded) && 'border-border/50 rounded-md border'
      )}
    >
      {visible.length > 0 ? (
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
      ) : null}
      {hasAlternatives ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'text-muted-foreground hover:bg-accent hover:text-foreground flex w-full cursor-pointer items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors',
            // Only draw the top border when there's a row above it;
            // in hideSelected collapsed state the button stands alone.
            visible.length > 0 && 'border-border/50 border-t'
          )}
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
