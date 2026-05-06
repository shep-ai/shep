import { FeatureTreePageClient } from './feature-tree-page-client';
import { getFeatureTreeData } from './get-feature-tree-data';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

export default async function FeaturesPage() {
  const { inventoryRows, repos, createData, initialDeployments } = await getFeatureTreeData();

  return (
    <div className="features-page-dotted-bg flex h-full flex-col p-6">
      <FeatureTreePageClient
        rows={inventoryRows}
        repos={repos}
        createData={createData}
        initialDeployments={initialDeployments}
      />
    </div>
  );
}
