'use client';

import { useState } from 'react';
import { Check, Download, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PluginType } from '@shepai/core/domain/generated/output';
import type { CatalogEntryWithStatus } from '@shepai/core/application/use-cases/plugins/get-plugin-catalog.use-case';

export interface PluginCatalogProps {
  catalog: CatalogEntryWithStatus[];
  onInstall?: (pluginName: string) => Promise<void>;
}

const TYPE_LABELS: Record<PluginType, string> = {
  [PluginType.Mcp]: 'MCP',
  [PluginType.Hook]: 'Hook',
  [PluginType.Cli]: 'CLI',
};

export function PluginCatalog({ catalog, onInstall }: PluginCatalogProps) {
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null);

  const handleInstall = async (pluginName: string) => {
    if (!onInstall) return;
    setInstallingPlugin(pluginName);
    try {
      await onInstall(pluginName);
    } finally {
      setInstallingPlugin(null);
    }
  };

  return (
    <div className="grid gap-3">
      {catalog.map((entry) => {
        const isInstalling = installingPlugin === entry.name;

        return (
          <Card key={entry.name}>
            <CardContent className="flex items-start gap-4 p-4">
              {/* Plugin info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{entry.displayName}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {TYPE_LABELS[entry.type as PluginType]}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {entry.description}
                </p>
                <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                  <span>
                    {entry.runtimeType === 'python' ? 'Python' : 'Node.js'}{' '}
                    {entry.runtimeMinVersion}+
                  </span>
                  {entry.requiredEnvVars.length > 0 ? (
                    <span>Requires: {entry.requiredEnvVars.join(', ')}</span>
                  ) : null}
                  {entry.homepageUrl ? (
                    <a
                      href={entry.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Docs
                    </a>
                  ) : null}
                </div>
              </div>

              {/* Install button or installed badge */}
              <div className="shrink-0 pt-0.5">
                {entry.isInstalled ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      'border-0 text-[10px]',
                      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    )}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Installed
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleInstall(entry.name)}
                    disabled={isInstalling}
                    className="h-7 text-xs"
                  >
                    {isInstalling ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3 w-3" />
                    )}
                    Install
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
