'use server';

/**
 * Fleet read model for the web surfaces (spec 111).
 *
 * Thin server action over the same two use cases the CLI calls, so the web
 * drawer and `shep fleet status` can never disagree about what the fleet looks
 * like. No business logic lives here.
 */

import { resolve } from '@/lib/server-container';
import { GetFleetOverviewUseCase } from '@shepai/core/application/use-cases/fleet/get-fleet-overview.use-case';
import { ListFleetTriageItemsUseCase } from '@shepai/core/application/use-cases/fleet/list-fleet-triage-items.use-case';
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
    resolve(GetFleetOverviewUseCase).execute(repositoryPath),
    resolve(ListFleetTriageItemsUseCase).execute(repositoryPath ? { repositoryPath } : undefined),
  ]);

  return { overview, triageItems };
}
