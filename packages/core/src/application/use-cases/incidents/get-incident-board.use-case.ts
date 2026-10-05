/**
 * GetIncidentBoardUseCase (spec 129): what an incidents screen shows — a
 * space's incidents, newest first, and one of them in full: the one asked
 * for when it belongs to the space, otherwise the newest unresolved, otherwise
 * the newest.
 */

import { injectable, inject } from 'tsyringe';
import { IncidentStatus, type Incident, type Space } from '../../../domain/generated/output.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import { resolveScope, type OpportunityResult } from '../opportunities/opportunity-scope.js';
import { ManageIncidentsUseCase, type IncidentDetail } from './manage-incidents.use-case.js';

export interface IncidentBoard {
  space: Space;
  incidents: Incident[];
  selected?: IncidentDetail;
}

export interface IncidentBoardInput {
  /** Space id or slug; the default space when omitted. */
  space?: string;
  /** The incident to show in full. */
  incident?: string;
}

@injectable()
export class GetIncidentBoardUseCase {
  constructor(
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject(ManageIncidentsUseCase) private readonly incidents: ManageIncidentsUseCase
  ) {}

  async execute(
    input: IncidentBoardInput = {}
  ): Promise<OpportunityResult<{ board: IncidentBoard }>> {
    const scope = await resolveScope(
      this.spaces,
      this.productLines,
      input.space ? { space: input.space } : {}
    );
    if (!scope.ok) return scope;
    const incidents = await this.incidents.list({ space: scope.space.id });
    const chosen =
      incidents.find((incident) => incident.id === input.incident) ??
      incidents.find((incident) => incident.status !== IncidentStatus.Resolved) ??
      incidents[0];
    const detail = chosen ? await this.incidents.get(chosen.id) : undefined;
    return {
      ok: true,
      board: {
        space: scope.space,
        incidents,
        ...(detail?.ok ? { selected: detail.detail } : {}),
      },
    };
  }
}
