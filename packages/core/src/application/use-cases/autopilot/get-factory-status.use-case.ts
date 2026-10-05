/**
 * GetFactoryStatusUseCase (spec 132): one space's factory at a glance — the
 * week's line, what is building, open incidents and the runtime actions
 * waiting for approval, outcomes still pending and customers to tell, and
 * the autopilot policy with its last pass.
 */

import { injectable, inject } from 'tsyringe';
import {
  OpportunityStatus,
  OutcomeVerdict,
  RuntimeActionStatus,
  type AutopilotPolicy,
  type AutopilotRun,
  type Space,
} from '../../../domain/generated/output.js';
import type { IRuntimeActionRepository } from '../../ports/output/repositories/incident-repository.interface.js';
import { GetOpportunityBoardUseCase } from '../opportunities/get-opportunity-board.use-case.js';
import { ManageIncidentsUseCase } from '../incidents/manage-incidents.use-case.js';
import { ManageOutcomesUseCase } from '../outcomes/manage-outcomes.use-case.js';
import type { OpportunityResult } from '../opportunities/opportunity-scope.js';
import { ManageAutopilotUseCase } from './manage-autopilot.use-case.js';

export interface FactoryStatus {
  space: Pick<Space, 'id' | 'name' | 'slug'>;
  line: { usedHours: number; capacityHours: number; inLine: number; waiting: number };
  /** Opportunities being built. */
  building: number;
  openIncidents: number;
  actionsAwaitingApproval: number;
  pendingOutcomes: number;
  customersToTell: number;
  autopilot: { policy: AutopilotPolicy; isDefault: boolean; lastRun?: AutopilotRun };
}

@injectable()
export class GetFactoryStatusUseCase {
  constructor(
    @inject(GetOpportunityBoardUseCase) private readonly board: GetOpportunityBoardUseCase,
    @inject(ManageIncidentsUseCase) private readonly incidents: ManageIncidentsUseCase,
    @inject('IRuntimeActionRepository') private readonly actions: IRuntimeActionRepository,
    @inject(ManageOutcomesUseCase) private readonly outcomes: ManageOutcomesUseCase,
    @inject(ManageAutopilotUseCase) private readonly autopilot: ManageAutopilotUseCase
  ) {}

  /** Space id or slug; the default space when omitted. */
  async execute(space?: string): Promise<OpportunityResult<{ status: FactoryStatus }>> {
    const board = await this.board.execute(space);
    if (!board.ok) return board;
    const { space: found, ranked, line } = board.board;
    const [incidents, outcomes, autopilot] = await Promise.all([
      this.incidents.list({ space: found.id, open: true }),
      this.outcomes.list(found.id),
      this.autopilot.get(found.id),
    ]);
    if (!outcomes.ok) return outcomes;
    if (!autopilot.ok) return autopilot;
    let actionsAwaitingApproval = 0;
    for (const incident of incidents) {
      const actions = await this.actions.listByIncident(incident.id);
      actionsAwaitingApproval += actions.filter(
        (action) => action.status === RuntimeActionStatus.Proposed
      ).length;
    }
    const [lastRun] = autopilot.runs;
    return {
      ok: true,
      status: {
        space: found,
        line: {
          usedHours: line.usedHours,
          capacityHours: line.capacityHours,
          inLine: line.inLine.length,
          waiting: line.waiting.length,
        },
        building: ranked.filter(
          ({ opportunity }) => opportunity.status === OpportunityStatus.Building
        ).length,
        openIncidents: incidents.length,
        actionsAwaitingApproval,
        pendingOutcomes: outcomes.outcomes.filter(
          ({ outcome }) => outcome.verdict === OutcomeVerdict.Pending
        ).length,
        customersToTell: outcomes.outcomes.reduce((sum, view) => sum + view.customers.length, 0),
        autopilot: {
          policy: autopilot.policy,
          isDefault: autopilot.isDefault,
          ...(lastRun ? { lastRun } : {}),
        },
      },
    };
  }
}
