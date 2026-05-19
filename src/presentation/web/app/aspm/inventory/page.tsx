/**
 * /aspm/inventory — Asset-risk inventory graph
 *
 * Feature 098, phase 7 (task-47). Server component that fetches the
 * application list + posture summary and renders the React Flow asset
 * graph. Falls back to the tabular table when the asset count exceeds
 * the feature-flag-defined cap (research decision 12 / plan risk row).
 */

import {
  GetPostureSummaryUseCase,
  type PostureSummary,
} from '@shepai/core/application/use-cases/aspm/posture/get-posture-summary';
import { ListApplicationsUseCase } from '@shepai/core/application/use-cases/applications/list-applications.use-case';
import { resolve } from '@/lib/server-container';

import { AssetRiskGraph } from '@/components/features/aspm/asset-risk-graph/asset-risk-graph';

export const dynamic = 'force-dynamic';

const TABULAR_THRESHOLD = 200;

export default async function AspmInventoryPage() {
  let applications: { id: string; name: string; ownerId?: string }[] = [];
  let posture: PostureSummary | null = null;
  let error: string | null = null;

  try {
    const apps = await resolve(ListApplicationsUseCase).execute();
    applications = apps.map((a) => ({ id: a.id, name: a.name, ownerId: undefined }));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    posture = await resolve(GetPostureSummaryUseCase).execute({ topAtRiskLimit: 50 });
  } catch (err) {
    error ??= err instanceof Error ? err.message : String(err);
  }

  const forceTabular = applications.length > TABULAR_THRESHOLD;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground text-sm">
          Asset-risk relationship graph for every application Shep is tracking.
        </p>
      </header>
      <AssetRiskGraph
        applications={applications}
        atRisk={posture?.topAtRiskApplications ?? []}
        error={error}
        forceTabular={forceTabular}
      />
    </div>
  );
}
