/**
 * ListOwnerRollupsUseCase (feature 098, phase 7, task-48).
 *
 * Joins Owner → Team → BusinessUnit with the per-owner open-finding
 * counts to produce the shape consumed by the /aspm/owners page's
 * OwnerMap component (one row per owner with team + BU + severity
 * counts).
 */

import { inject, injectable } from 'tsyringe';

import {
  CanonicalSeverity,
  type BusinessUnit,
  type Team,
} from '../../../../domain/generated/output.js';
import type { IOwnerRepository } from '../../../ports/output/repositories/owner-repository.interface.js';
import type { ITeamRepository } from '../../../ports/output/repositories/team-repository.interface.js';
import type { IBusinessUnitRepository } from '../../../ports/output/repositories/business-unit-repository.interface.js';
import type {
  IFindingRepository,
  SeverityCount,
} from '../../../ports/output/repositories/finding-repository.interface.js';

export interface OwnerRollup {
  ownerId: string;
  ownerName: string;
  ownerHandle?: string;
  teamId?: string;
  teamName?: string;
  businessUnitId?: string;
  businessUnitName?: string;
  openFindingCount: number;
  severityCounts: SeverityCount[];
}

@injectable()
export class ListOwnerRollupsUseCase {
  constructor(
    @inject('IOwnerRepository') private readonly owners: IOwnerRepository,
    @inject('ITeamRepository') private readonly teams: ITeamRepository,
    @inject('IBusinessUnitRepository') private readonly businessUnits: IBusinessUnitRepository,
    @inject('IFindingRepository') private readonly findings: IFindingRepository
  ) {}

  async execute(): Promise<OwnerRollup[]> {
    const [owners, teams, businessUnits] = await Promise.all([
      this.owners.listAll(),
      this.teams.listAll(),
      this.businessUnits.listAll(),
    ]);

    const teamById = new Map<string, Team>(teams.map((t) => [t.id, t]));
    const buById = new Map<string, BusinessUnit>(businessUnits.map((b) => [b.id, b]));

    const rollups: OwnerRollup[] = [];
    for (const owner of owners) {
      const severityCounts = await this.findings.countOpenBySeverity({ ownerIds: [owner.id] });
      const openFindingCount = severityCounts.reduce((sum, c) => sum + c.count, 0);
      const team = owner.teamId !== undefined ? teamById.get(owner.teamId) : undefined;
      const bu = team?.businessUnitId !== undefined ? buById.get(team.businessUnitId) : undefined;
      rollups.push({
        ownerId: owner.id,
        ownerName: owner.name,
        ownerHandle: owner.handle,
        teamId: team?.id,
        teamName: team?.name,
        businessUnitId: bu?.id,
        businessUnitName: bu?.name,
        openFindingCount,
        severityCounts: zeroFill(severityCounts),
      });
    }
    return rollups;
  }
}

const ALL_SEVERITIES: CanonicalSeverity[] = [
  CanonicalSeverity.Critical,
  CanonicalSeverity.High,
  CanonicalSeverity.Medium,
  CanonicalSeverity.Low,
  CanonicalSeverity.Info,
];

function zeroFill(rows: SeverityCount[]): SeverityCount[] {
  const byKey = new Map(rows.map((r) => [r.severity, r.count]));
  return ALL_SEVERITIES.map((s) => ({ severity: s, count: byKey.get(s) ?? 0 }));
}
