import { notFound } from 'next/navigation';
import { resolve } from '@/lib/server-container';
import type { ListClustersUseCase } from '@shepai/core/application/use-cases/clusters/list-clusters.use-case';
import { getFeatureFlags } from '@/lib/feature-flags';
import { ClustersPageClient } from '@/components/features/clusters/clusters-page-client';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function ClustersPage() {
  const flags = getFeatureFlags();
  if (!flags.clusters) notFound();

  const useCase = resolve<ListClustersUseCase>('ListClustersUseCase');
  const clusters = await useCase.execute();

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#eef0f3] p-6 dark:bg-[#111113]">
      <ClustersPageClient initialClusters={clusters} />
    </div>
  );
}
