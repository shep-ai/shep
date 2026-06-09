'use client';

import { useState, useCallback } from 'react';
import { Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ToolCard } from './tool-card';
import type { ToolItem } from '@shepai/core/application/use-cases/tools/list-tools.use-case';

export interface ToolsPageClientProps {
  tools: ToolItem[];
  className?: string;
}

type TabValue = 'all' | 'ide' | 'cli-agent' | 'vcs' | 'terminal' | 'cluster';

const TAB_FILTER: Record<TabValue, (tool: ToolItem) => boolean> = {
  all: () => true,
  ide: (tool) => tool.tags.includes('ide'),
  'cli-agent': (tool) => tool.tags.includes('cli-agent'),
  vcs: (tool) => tool.tags.includes('vcs'),
  terminal: (tool) => tool.tags.includes('terminal'),
  cluster: (tool) => tool.tags.includes('cluster'),
};

export function ToolsPageClient({ tools: initialTools, className }: ToolsPageClientProps) {
  const [tools, setTools] = useState<ToolItem[]>(initialTools);
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  const refreshTools = useCallback(async () => {
    try {
      const res = await fetch('/api/tools');
      if (res.ok) {
        const updated = (await res.json()) as ToolItem[];
        setTools(updated);
      }
    } catch {
      // Silently ignore refresh errors; user can re-navigate to refresh
    }
  }, []);

  const filtered = tools.filter(TAB_FILTER[activeTab]);

  return (
    <div data-testid="tools-page-client" className={cn('space-y-4', className)}>
      {/* Compact header */}
      <div className="flex items-center gap-2">
        <Wrench className="text-muted-foreground h-4 w-4" />
        <h1 className="text-sm font-bold tracking-tight">Tools</h1>
        <span className="text-muted-foreground text-[10px]">
          {tools.filter((t) => t.status.status === 'available').length}/{tools.length} installed
        </span>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabValue)}
        data-testid="tools-page-tabs"
      >
        <TabsList className="h-7">
          <TabsTrigger value="all" data-testid="tools-tab-all" className="px-2.5 text-xs">
            All
          </TabsTrigger>
          <TabsTrigger value="ide" data-testid="tools-tab-ide" className="px-2.5 text-xs">
            IDEs
          </TabsTrigger>
          <TabsTrigger
            value="cli-agent"
            data-testid="tools-tab-cli-agent"
            className="px-2.5 text-xs"
          >
            CLI Agents
          </TabsTrigger>
          <TabsTrigger value="vcs" data-testid="tools-tab-vcs" className="px-2.5 text-xs">
            Version Control
          </TabsTrigger>
          <TabsTrigger value="terminal" data-testid="tools-tab-terminal" className="px-2.5 text-xs">
            Terminals
          </TabsTrigger>
          <TabsTrigger value="cluster" data-testid="tools-tab-cluster" className="px-2.5 text-xs">
            Clusters
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-3">
          {filtered.length === 0 ? (
            <div
              data-testid="tools-page-empty"
              className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center"
            >
              <Wrench className="mb-2 h-6 w-6 opacity-20" />
              <p className="text-xs">No tools in this category.</p>
            </div>
          ) : (
            <div
              data-testid="tools-page-grid"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {filtered.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onRefresh={refreshTools} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
