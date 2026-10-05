/**
 * RunAutopilotUseCase (spec 132): one autopilot pass per space with autopilot
 * on — investigate urgent work items, fix confident hypotheses within the
 * daily budget, and build the accepted opportunities of the line — recorded
 * as an AutopilotRun. A failure is recorded and the pass goes on.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import type {
  AutopilotPolicy,
  AutopilotRun,
  WorkItemInvestigation,
} from '../../../domain/generated/output.js';
import {
  MAX_INVESTIGATIONS_PER_PASS,
  confidentHypothesis,
  fixGates,
  fixesLeft,
  isAutopilotOn,
  linesToBuild,
} from '../../../domain/shared/autopilot.js';
import { isInvestigationActive } from '../../../domain/shared/investigation.js';
import { workItemKey } from '../../../domain/shared/work-item-key.js';
import type {
  IAutopilotPolicyRepository,
  IAutopilotRunRepository,
} from '../../ports/output/repositories/autopilot-repository.interface.js';
import type { IInvestigationRepository } from '../../ports/output/repositories/investigation-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import { InvestigateWorkItemUseCase } from '../bug-loop/investigate-work-item.use-case.js';
import { ApproveHypothesisUseCase } from '../bug-loop/approve-hypothesis.use-case.js';
import { GetOpportunityBoardUseCase } from '../opportunities/get-opportunity-board.use-case.js';
import { BuildOpportunityUseCase } from '../opportunities/build-opportunity.use-case.js';
import { errorMessage } from '../connections/connection-refs.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';
import {
  ListUrgentWorkItemsUseCase,
  type UrgentWorkItem,
} from './list-urgent-work-items.use-case.js';

type Pass = Pick<AutopilotRun, 'investigated' | 'fixed' | 'built' | 'errors'>;

@injectable()
export class RunAutopilotUseCase {
  constructor(
    @inject('IAutopilotPolicyRepository') private readonly policies: IAutopilotPolicyRepository,
    @inject('IAutopilotRunRepository') private readonly runs: IAutopilotRunRepository,
    @inject(ListUrgentWorkItemsUseCase) private readonly urgent: ListUrgentWorkItemsUseCase,
    @inject('IInvestigationRepository') private readonly investigations: IInvestigationRepository,
    @inject(InvestigateWorkItemUseCase) private readonly investigate: InvestigateWorkItemUseCase,
    @inject(ApproveHypothesisUseCase) private readonly approve: ApproveHypothesisUseCase,
    @inject(GetOpportunityBoardUseCase) private readonly board: GetOpportunityBoardUseCase,
    @inject(BuildOpportunityUseCase) private readonly build: BuildOpportunityUseCase,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository
  ) {}

  /** A pass in every space with autopilot on; the daemon's tick. */
  async runAll(now = new Date()): Promise<AutopilotRun[]> {
    const passes: AutopilotRun[] = [];
    for (const policy of await this.policies.list()) {
      if (isAutopilotOn(policy)) passes.push(await this.runSpace(policy, now));
    }
    return passes;
  }

  /** A pass in one space now. Space id or slug; the default space when omitted. */
  async run(space?: string): Promise<OpportunityResult<{ run: AutopilotRun }>> {
    const scope = await resolveScope(this.spaces, this.productLines, space ? { space } : {});
    if (!scope.ok) return scope;
    const policy = await this.policies.find(scope.space.id);
    if (!policy || !isAutopilotOn(policy))
      return failure(`Autopilot is off in ${scope.space.name}.`);
    return { ok: true, run: await this.runSpace(policy, new Date()) };
  }

  private async runSpace(policy: AutopilotPolicy, now: Date): Promise<AutopilotRun> {
    const pass: Pass = { investigated: [], fixed: [], built: [], errors: [] };
    try {
      if (policy.investigateUrgent || policy.fixConfident) await this.bugs(policy, now, pass);
      if (policy.fillLine && policy.projectId) await this.fillLine(policy, policy.projectId, pass);
    } catch (error) {
      pass.errors.push(errorMessage(error));
    }
    const run: AutopilotRun = {
      id: randomUUID(),
      spaceId: policy.spaceId,
      ...pass,
      createdAt: now,
      updatedAt: now,
    };
    await this.runs.create(run);
    return run;
  }

  private async bugs(policy: AutopilotPolicy, now: Date, pass: Pass): Promise<void> {
    let fixes = fixesLeft(await this.runs.listBySpace(policy.spaceId), policy.dailyFixBudget, now);
    for (const item of await this.urgent.execute(policy.spaceId)) {
      const key = workItemKey(item.workItem);
      try {
        let history = await this.investigations.listByWorkItem(item.workItem.id);
        if (
          policy.investigateUrgent &&
          history.length === 0 &&
          pass.investigated.length < MAX_INVESTIGATIONS_PER_PASS
        ) {
          history = await this.investigateItem(item, key, pass);
        }
        if (!policy.fixConfident || fixes === 0) continue;
        if (await this.fixItem(policy, item, key, history, now, pass)) fixes -= 1;
      } catch (error) {
        pass.errors.push(`${key}: ${errorMessage(error)}`);
      }
    }
  }

  private async investigateItem(
    item: UrgentWorkItem,
    key: string,
    pass: Pass
  ): Promise<WorkItemInvestigation[]> {
    const started = await this.investigate.start({
      workItem: item.workItem.id,
      repositoryPath: item.repositoryPath,
    });
    if (!started.ok) {
      pass.errors.push(`${key}: ${started.error}`);
      return [];
    }
    pass.investigated.push(key);
    await this.investigate.run(started.investigation.id);
    return this.investigations.listByWorkItem(item.workItem.id);
  }

  /** True when a fix started. */
  private async fixItem(
    policy: AutopilotPolicy,
    item: UrgentWorkItem,
    key: string,
    history: readonly WorkItemInvestigation[],
    now: Date,
    pass: Pass
  ): Promise<boolean> {
    if (history.some((inv) => inv.featureId !== undefined || isInvestigationActive(inv, now))) {
      return false;
    }
    const latest = history[0];
    const hypothesis = latest ? confidentHypothesis(latest) : undefined;
    if (!latest || hypothesis === undefined) return false;
    const approved = await this.approve.execute({
      workItem: item.workItem.id,
      hypothesis,
      investigationId: latest.id,
      approvalGates: fixGates(policy),
    });
    if (!approved.ok) {
      pass.errors.push(`${key}: ${approved.error}`);
      return false;
    }
    pass.fixed.push(key);
    const outcome = await approved.started;
    if (outcome.error) pass.errors.push(`${key}: ${outcome.error}`);
    return true;
  }

  private async fillLine(policy: AutopilotPolicy, projectId: string, pass: Pass): Promise<void> {
    const board = await this.board.execute(policy.spaceId);
    if (!board.ok) {
      pass.errors.push(board.error);
      return;
    }
    for (const { opportunity } of linesToBuild(board.board.line.inLine)) {
      const built = await this.build.execute(opportunity.id, projectId);
      if (built.ok) pass.built.push(opportunity.id);
      else pass.errors.push(`${opportunity.title}: ${built.error}`);
    }
  }
}
