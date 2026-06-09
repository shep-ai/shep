/**
 * ListInventoryPostureUseCase
 *
 * Aggregator for the ASPM Inventory tree-table — returns one row per
 * Application with its canonical-severity rollup + the last-scanned
 * timestamp the {@link ScanApplicationUseCase} writes back to
 * `applications.lastScannedAt`. The web inventory page composes these
 * rows with the repository list so the Tabulator tree can group by
 * repository and surface scan/finding badges per app row.
 *
 * Per-application failure isolation: a count query that throws is
 * recorded on the row (`countsError`) instead of poisoning the whole
 * response — the page degrades to "0 open" for that row but still
 * renders the rest of the inventory.
 */

import { inject, injectable } from 'tsyringe';

import type {
  ApplicationWithStatus,
  ListApplicationsUseCase,
} from '../../applications/list-applications.use-case.js';
import type {
  IFindingRepository,
  SeverityCount,
} from '../../../ports/output/repositories/finding-repository.interface.js';

export interface InventoryPostureRow {
  applicationId: string;
  name: string;
  repositoryPath: string;
  lastScannedAt: Date | null;
  openBySeverity: SeverityCount[];
  totalOpen: number;
  application: ApplicationWithStatus;
  /** Set when the per-app severity count query threw — UI degrades gracefully. */
  countsError?: string;
}

@injectable()
export class ListInventoryPostureUseCase {
  constructor(
    @inject('ListApplicationsUseCase')
    private readonly listApplications: ListApplicationsUseCase,
    @inject('IFindingRepository') private readonly findings: IFindingRepository
  ) {}

  async execute(): Promise<InventoryPostureRow[]> {
    const applications = await this.listApplications.execute();
    if (applications.length === 0) return [];

    return Promise.all(applications.map((app) => this.buildRow(app)));
  }

  private async buildRow(app: ApplicationWithStatus): Promise<InventoryPostureRow> {
    try {
      const openBySeverity = await this.findings.countOpenBySeverity({
        applicationIds: [app.id],
      });
      const totalOpen = openBySeverity.reduce((sum, row) => sum + row.count, 0);
      return {
        applicationId: app.id,
        name: app.name,
        repositoryPath: app.repositoryPath,
        lastScannedAt: app.lastScannedAt ?? null,
        openBySeverity,
        totalOpen,
        application: app,
      };
    } catch (err) {
      return {
        applicationId: app.id,
        name: app.name,
        repositoryPath: app.repositoryPath,
        lastScannedAt: app.lastScannedAt ?? null,
        openBySeverity: [],
        totalOpen: 0,
        application: app,
        countsError: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
