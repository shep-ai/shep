'use client';

/**
 * Cloud-provider selection dropdown used by DeployButton.
 *
 * Purely presentational: takes a `providers` list (fetched via
 * /api/cloud-providers) and renders each with its icon, display name,
 * and state badge. Disabled providers show "Coming soon"; enabled-but-
 * not-connected providers show "Not connected" and trigger the
 * connect-provider modal when clicked; enabled-and-connected providers
 * just emit onSelect for the parent button to run Deploy.
 */

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

export interface CloudProviderListEntry {
  id: CloudDeploymentProvider;
  displayName: string;
  enabled: boolean;
  connected: boolean;
}

export interface ProviderDropdownProps {
  trigger: React.ReactNode;
  providers: CloudProviderListEntry[];
  selectedProvider: CloudDeploymentProvider | null;
  onSelectEnabled(provider: CloudDeploymentProvider): void;
  onSelectDisconnected(provider: CloudDeploymentProvider): void;
}

export function ProviderDropdown({
  trigger,
  providers,
  selectedProvider,
  onSelectEnabled,
  onSelectDisconnected,
}: ProviderDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Deploy to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {providers.map((provider) => {
          const Icon = CLOUD_PROVIDER_ICONS[provider.id];
          const disabled = !provider.enabled;
          const badge = !provider.enabled
            ? 'Coming soon'
            : provider.connected
              ? 'Connected'
              : 'Not connected';
          const selected = provider.id === selectedProvider;
          return (
            <DropdownMenuItem
              key={provider.id}
              disabled={disabled}
              onSelect={() => {
                if (disabled) return;
                if (provider.connected) {
                  onSelectEnabled(provider.id);
                } else {
                  onSelectDisconnected(provider.id);
                }
              }}
              className="flex items-center gap-2"
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 truncate text-sm">{provider.displayName}</span>
              <span
                className={`text-[10px] tracking-wide uppercase ${
                  disabled
                    ? 'text-muted-foreground'
                    : provider.connected
                      ? 'text-emerald-500'
                      : 'text-amber-500'
                }`}
              >
                {badge}
              </span>
              {selected ? <span className="ml-1 text-[10px]">●</span> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
