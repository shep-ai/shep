'use client';

import { useState } from 'react';
import { Trash2, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/common/empty-state';
import { PluginHealthStatus, PluginType, type Plugin } from '@shepai/core/domain/generated/output';

export interface PluginListProps {
  plugins: Plugin[];
  onToggle?: (pluginName: string, enabled: boolean) => Promise<void>;
  onRemove?: (pluginName: string) => Promise<void>;
  onCheckHealth?: (pluginName: string) => Promise<void>;
}

const HEALTH_BADGE_STYLES: Record<PluginHealthStatus, string> = {
  [PluginHealthStatus.Healthy]: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  [PluginHealthStatus.Degraded]: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  [PluginHealthStatus.Unavailable]: 'bg-red-500/15 text-red-700 dark:text-red-400',
  [PluginHealthStatus.Unknown]: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

const TYPE_LABELS: Record<PluginType, string> = {
  [PluginType.Mcp]: 'MCP',
  [PluginType.Hook]: 'Hook',
  [PluginType.Cli]: 'CLI',
};

export function PluginList({ plugins, onToggle, onRemove, onCheckHealth }: PluginListProps) {
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set());
  const [removingPlugin, setRemovingPlugin] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<Set<string>>(new Set());

  if (plugins.length === 0) {
    return (
      <EmptyState
        title="No plugins installed"
        description="Browse the catalog to discover and install AI-native tool plugins."
      />
    );
  }

  const handleToggle = async (pluginName: string, enabled: boolean) => {
    if (!onToggle) return;
    setTogglingPlugins((prev) => new Set(prev).add(pluginName));
    try {
      await onToggle(pluginName, enabled);
    } finally {
      setTogglingPlugins((prev) => {
        const next = new Set(prev);
        next.delete(pluginName);
        return next;
      });
    }
  };

  const handleRemove = async (pluginName: string) => {
    if (!onRemove) return;
    setRemovingPlugin(pluginName);
    try {
      await onRemove(pluginName);
    } finally {
      setRemovingPlugin(null);
    }
  };

  const handleCheckHealth = async (pluginName: string) => {
    if (!onCheckHealth) return;
    setCheckingHealth((prev) => new Set(prev).add(pluginName));
    try {
      await onCheckHealth(pluginName);
    } finally {
      setCheckingHealth((prev) => {
        const next = new Set(prev);
        next.delete(pluginName);
        return next;
      });
    }
  };

  return (
    <div className="grid gap-3">
      {plugins.map((plugin) => {
        const isToggling = togglingPlugins.has(plugin.name);
        const isRemoving = removingPlugin === plugin.name;
        const isChecking = checkingHealth.has(plugin.name);

        return (
          <Card key={plugin.id}>
            <CardContent className="flex items-center gap-4 p-4">
              {/* Plugin info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{plugin.displayName}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {TYPE_LABELS[plugin.type]}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'shrink-0 border-0 text-[10px]',
                      HEALTH_BADGE_STYLES[plugin.healthStatus]
                    )}
                  >
                    {plugin.healthStatus}
                  </Badge>
                </div>
                {plugin.description ? (
                  <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    {plugin.description}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCheckHealth(plugin.name)}
                  disabled={isChecking || isRemoving}
                  aria-label={`Check health for ${plugin.displayName}`}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isChecking && 'animate-spin')} />
                </Button>

                <Switch
                  checked={plugin.enabled}
                  onCheckedChange={(checked) => handleToggle(plugin.name, checked)}
                  disabled={isToggling || isRemoving}
                  size="sm"
                  aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.displayName}`}
                />

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemove(plugin.name)}
                  disabled={isRemoving}
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove ${plugin.displayName}`}
                >
                  {isRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
