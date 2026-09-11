/**
 * List Fleet Triage Items Use Case
 *
 * Surfaces exceptions across the fleet requiring human decision or intervention,
 * ordered by urgency tier (P1 blockers, P2 failures, P3 warnings) and timestamp.
 *
 * Following Clean Architecture:
 * - Application layer use case
 * - Port dependency: IFleetRepository
 */

import { injectable, inject } from 'tsyringe';
import type { FleetTriageItem } from '../../../domain/generated/output.js';
import { FleetTriagePriority } from '../../../domain/generated/output.js';
import type {
  IFleetRepository,
  FleetTriageFilters,
} from '../../ports/output/repositories/fleet-repository.interface.js';

const PRIORITY_ORDER: Record<FleetTriagePriority, number> = {
  [FleetTriagePriority.p1]: 1,
  [FleetTriagePriority.p2]: 2,
  [FleetTriagePriority.p3]: 3,
};

@injectable()
export class ListFleetTriageItemsUseCase {
  constructor(
    @inject('IFleetRepository')
    private readonly fleetRepo: IFleetRepository
  ) {}

  /**
   * Returns prioritized exceptions requiring human attention.
   */
  async execute(filters?: FleetTriageFilters): Promise<FleetTriageItem[]> {
    const items = await this.fleetRepo.listTriageItems(filters);

    // Sort by priority (P1 -> P2 -> P3), then by creation date descending (newest first).
    // Sorted on a copy so the repository's own ordering is never mutated in place.
    return [...items].sort((a, b) => {
      const orderA = PRIORITY_ORDER[a.priority] ?? 99;
      const orderB = PRIORITY_ORDER[b.priority] ?? 99;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }
}
