import { resolve } from '@/lib/server-container';
import type { ListPluginsUseCase } from '@shepai/core/application/use-cases/plugins/list-plugins.use-case';
import type {
  GetPluginCatalogUseCase,
  CatalogEntryWithStatus,
} from '@shepai/core/application/use-cases/plugins/get-plugin-catalog.use-case';
import type { Plugin } from '@shepai/core/domain/generated/output';
import { PluginsPageClient } from './plugins-page-client';

/** Skip static pre-rendering since we need runtime DI container. */
export const dynamic = 'force-dynamic';

export default async function PluginsPage() {
  let plugins: Plugin[] = [];
  let catalog: CatalogEntryWithStatus[] = [];

  try {
    const listUseCase = resolve<ListPluginsUseCase>('ListPluginsUseCase');
    plugins = await listUseCase.execute();
  } catch {
    // DI container may not be available during build
  }

  try {
    const catalogUseCase = resolve<GetPluginCatalogUseCase>('GetPluginCatalogUseCase');
    catalog = await catalogUseCase.execute();
  } catch {
    // DI container may not be available during build
  }

  return (
    <div className="flex h-full flex-col p-6">
      <PluginsPageClient plugins={plugins} catalog={catalog} />
    </div>
  );
}
