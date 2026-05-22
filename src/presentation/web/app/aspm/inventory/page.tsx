/**
 * /aspm/inventory — Tabular asset inventory
 *
 * Server component that fetches the repository list + the
 * application-posture rollup (severity counts + last-scanned timestamp
 * per app) and renders the same FeatureTreeTable used on /features.
 *
 * The React-Flow asset graph has been retired in favor of this view —
 * row click navigates to /aspm/findings?app=<id> so the inventory and
 * findings views stay integrated end-to-end. Each application row also
 * exposes a Scan-now / Re-scan trigger via the row-actions portal.
 */

import type { ListInventoryPostureUseCase } from '@shepai/core/application/use-cases/aspm/posture/list-inventory-posture';
import type { ListRepositoriesUseCase } from '@shepai/core/application/use-cases/repositories/list-repositories.use-case';
import type { ListFeaturesUseCase } from '@shepai/core/application/use-cases/features/list-features.use-case';

import { resolve } from '@/lib/server-container';
import {
  AspmInventoryTree,
  buildAspmInventoryRows,
  type AspmInventoryFeature,
} from '@/components/features/aspm/aspm-inventory-tree';

export const dynamic = 'force-dynamic';

export default async function AspmInventoryPage() {
  let error: string | null = null;
  let rows: ReturnType<typeof buildAspmInventoryRows> = [];

  try {
    const [postureRows, repositories, allFeatures] = await Promise.all([
      resolve<ListInventoryPostureUseCase>('ListInventoryPostureUseCase').execute(),
      resolve<ListRepositoriesUseCase>('ListRepositoriesUseCase').execute(),
      resolve<ListFeaturesUseCase>('ListFeaturesUseCase').execute(),
    ]);
    const repoByPath = new Map(
      repositories.map((r) => [r.path, { id: r.id, name: r.name, remoteUrl: r.remoteUrl }])
    );
    const features: AspmInventoryFeature[] = allFeatures.map((f) => ({
      id: f.id,
      name: f.name,
      branch: f.branch,
      repositoryPath: f.repositoryPath,
      worktreePath: f.worktreePath,
      applicationId: f.applicationId,
      lifecycle: f.lifecycle,
    }));
    rows = buildAspmInventoryRows({ postureRows, repoByPath, features });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground text-sm">
          Every application Shep tracks, grouped by repository — with current open-finding counts
          and last-scanned status. Click a row to drill into its findings.
        </p>
      </header>
      <AspmInventoryTree rows={rows} error={error} className="flex-1" />
    </div>
  );
}
