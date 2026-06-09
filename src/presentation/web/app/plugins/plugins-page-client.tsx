'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plug } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { PluginList } from '@/components/common/plugin-list';
import { PluginCatalog } from '@/components/common/plugin-catalog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addPlugin } from '@/app/actions/add-plugin';
import { removePlugin } from '@/app/actions/remove-plugin';
import { togglePlugin } from '@/app/actions/toggle-plugin';
import { checkPluginHealth } from '@/app/actions/check-plugin-health';
import type { Plugin } from '@shepai/core/domain/generated/output';
import type { CatalogEntryWithStatus } from '@shepai/core/application/use-cases/plugins/get-plugin-catalog.use-case';

export interface PluginsPageClientProps {
  plugins: Plugin[];
  catalog: CatalogEntryWithStatus[];
}

export function PluginsPageClient({ plugins, catalog }: PluginsPageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(plugins.length > 0 ? 'installed' : 'catalog');

  const handleToggle = useCallback(
    async (pluginName: string, enabled: boolean) => {
      const result = await togglePlugin(pluginName, enabled);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${pluginName} ${enabled ? 'enabled' : 'disabled'}`);
        router.refresh();
      }
    },
    [router]
  );

  const handleRemove = useCallback(
    async (pluginName: string) => {
      const result = await removePlugin(pluginName);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${pluginName} removed`);
        router.refresh();
      }
    },
    [router]
  );

  const handleCheckHealth = useCallback(
    async (pluginName: string) => {
      const result = await checkPluginHealth(pluginName);
      if (result.error) {
        toast.error(result.error);
      } else if (result.results?.[0]) {
        const health = result.results[0];
        toast.info(`${pluginName}: ${health.status} — ${health.message}`);
        router.refresh();
      }
    },
    [router]
  );

  const handleInstall = useCallback(
    async (pluginName: string) => {
      const result = await addPlugin(pluginName);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${pluginName} installed`);
        setActiveTab('installed');
        router.refresh();
      }
    },
    [router]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plugins" description="Manage AI-native tool plugins for agentic workflows">
        <Plug className="text-muted-foreground h-5 w-5" />
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="installed">
            Installed{plugins.length > 0 ? ` (${plugins.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
        </TabsList>

        <TabsContent value="installed">
          <PluginList
            plugins={plugins}
            onToggle={handleToggle}
            onRemove={handleRemove}
            onCheckHealth={handleCheckHealth}
          />
        </TabsContent>

        <TabsContent value="catalog">
          <PluginCatalog catalog={catalog} onInstall={handleInstall} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
