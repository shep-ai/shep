'use client';

/**
 * Cloud-provider selection dropdown used by DeployButton.
 *
 * Purely presentational: takes a `providers` list (fetched via
 * /api/cloud-providers) and renders each with its icon, display name,
 * and state badge. Providers without a token show "Not connected" and
 * trigger the connect-provider modal when clicked; connected providers
 * just emit onSelect for the parent button to run Deploy.
 */

import { Pencil } from 'lucide-react';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CLOUD_PROVIDER_ICONS } from './cloud-provider-icons';
import type { CloudProviderListEntry } from './cloud-providers';

export interface ProviderDropdownProps {
  trigger: React.ReactNode;
  providers: CloudProviderListEntry[];
  selectedProvider: CloudDeploymentProvider | null;
  loading?: boolean;
  loadError?: string | null;
  onSelectConnected(provider: CloudDeploymentProvider): void;
  onSelectDisconnected(provider: CloudDeploymentProvider): void;
  onEditConnection?(provider: CloudDeploymentProvider): void;
}

export function ProviderDropdown({
  trigger,
  providers,
  selectedProvider,
  loading = false,
  loadError = null,
  onSelectConnected,
  onSelectDisconnected,
  onEditConnection,
}: ProviderDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-medium tracking-wide uppercase">
          Deploy to
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="text-muted-foreground px-2 py-1.5 text-xs">Loading providers…</div>
        ) : loadError ? (
          <div className="text-destructive px-2 py-1.5 text-xs">{loadError}</div>
        ) : providers.length === 0 ? (
          <div className="text-muted-foreground px-2 py-1.5 text-xs">No providers available</div>
        ) : null}
        {providers.map((provider) => {
          const Icon = CLOUD_PROVIDER_ICONS[provider.id];
          const badge = provider.connected ? 'Connected' : 'Not connected';
          const selected = provider.id === selectedProvider;
          return (
            <DropdownMenuItem
              key={provider.id}
              onSelect={() => {
                if (provider.connected) {
                  onSelectConnected(provider.id);
                } else {
                  onSelectDisconnected(provider.id);
                }
              }}
              className="flex cursor-pointer items-center gap-2"
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{provider.displayName}</span>
              <span
                className={`shrink-0 text-[10px] whitespace-nowrap uppercase ${
                  provider.connected ? 'text-emerald-500' : 'text-amber-500'
                }`}
              >
                {badge}
              </span>
              {selected ? <span className="ml-1 text-[10px]">●</span> : null}
              {provider.connected && onEditConnection ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:bg-accent ml-1 inline-flex size-5 cursor-pointer items-center justify-center rounded"
                  aria-label={`Update ${provider.displayName} token`}
                  title="Update token"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEditConnection(provider.id);
                  }}
                  onPointerDown={(e) => {
                    // Stop Radix DropdownMenuItem from selecting/closing on press.
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Pencil className="size-3" />
                </button>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
