'use server';

/**
 * Fleet read model for the web surfaces (spec 111).
 *
 * Thin server action over the same two use cases the CLI calls, so the web
 * drawer and `shep fleet status` can never disagree about what the fleet looks
 * like. No business logic lives here.
 *
 * The use cases are imported as **types** and resolved by string token, which
 * is the convention every other action in this directory follows. A value
 * import makes Turbopack bundle the core module graph, and core's internal
 * relative imports are `.js`-suffixed (`../../../domain/generated/output.js`) to
 * suit Node ESM — Next has no `extensionAlias` for that here, so the production
 * build fails with `Module not found`. Resolving by token keeps core out of the
 * bundle entirely.
 */

import { resolve } from '@/lib/server-container';
import type { GetFleetOverviewUseCase as GetFleetOverview } from '@shepai/core/application/use-cases/fleet/get-fleet-overview.use-case';
import type { ListFleetTriageItemsUseCase as ListFleetTriageItems } from '@shepai/core/application/use-cases/fleet/list-fleet-triage-items.use-case';
import type { FleetOverview, FleetTriageItem } from '@shepai/core/domain/generated/output';

export interface FleetData {
  overview: FleetOverview;
  triageItems: FleetTriageItem[];
}

/**
 * Reads the fleet rollup and the exception feed.
 *
 * @param repositoryPath Optional repository path to scope the fleet
 */
export async function getFleetData(repositoryPath?: string): Promise<FleetData> {
  const [overview, triageItems] = await Promise.all([
    resolve<GetFleetOverview>('GetFleetOverviewUseCase').execute(repositoryPath),
    resolve<ListFleetTriageItems>('ListFleetTriageItemsUseCase').execute(
      repositoryPath ? { repositoryPath } : undefined
    ),
  ]);

  return { overview, triageItems };
}
