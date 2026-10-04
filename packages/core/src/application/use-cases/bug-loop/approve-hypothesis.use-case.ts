/**
 * Approve a hypothesis (spec 123): it becomes a feature in the investigated
 * repository whose agent proves the cause with a failing test, then fixes it.
 * The approval is recorded on the investigation and the work item moves to
 * its project's first Started state (which a two-way tracker rule pushes).
 *
 * Feature creation is two-phase, as everywhere: the record is created before
 * this returns; worktree setup and the agent spawn are `started`, which the
 * CLI awaits and the web leaves running. `started` never rejects.
 */

import { injectable, inject } from 'tsyringe';
import {
  BuildMode,
  InvestigationStatus,
  StateGroup,
  type AgentType,
  type Feature,
  type WorkItem,
  type WorkItemInvestigation,
} from '../../../domain/generated/output.js';
import { ProjectStates } from '../../../domain/shared/project-states.js';
import { workItemKey } from '../../../domain/shared/work-item-key.js';
import type { IInvestigationRepository } from '../../ports/output/repositories/investigation-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import { CreateFeatureUseCase } from '../features/create/create-feature.use-case.js';
import type { CreateFeatureInput } from '../features/create/types.js';
import { GetWorkItemUseCase } from '../work-items/get-work-item.use-case.js';
import { UpdateWorkItemUseCase } from '../work-items/update-work-item.use-case.js';
import { buildFixPrompt, fixFeatureName } from './fix-prompt.js';
import { listInvestigations } from './investigation-records.js';

export interface ApproveHypothesisInput {
  /** Work item id or key such as PAY-42. */
  workItem: string;
  /** Hypothesis number (1 is the most likely). */
  hypothesis: number;
  /** The investigation to approve from; defaults to the latest completed one. */
  investigationId?: string;
  /** Run the full spec pipeline instead of Fast mode. */
  fullSpec?: boolean;
  /** Agent for the fix; defaults to the investigating agent. */
  agentType?: AgentType;
}

/** How the background part of feature creation went. */
export interface FixStartOutcome {
  warning?: string;
  error?: string;
}

export type ApproveHypothesisResult =
  | {
      ok: true;
      feature: Feature;
      investigation: WorkItemInvestigation;
      started: Promise<FixStartOutcome>;
    }
  | { ok: false; error: string };

interface Refusal {
  ok: false;
  error: string;
}

@injectable()
export class ApproveHypothesisUseCase {
  constructor(
    @inject('IInvestigationRepository') private readonly repo: IInvestigationRepository,
    @inject(GetWorkItemUseCase) private readonly getWorkItem: GetWorkItemUseCase,
    @inject(CreateFeatureUseCase) private readonly createFeature: CreateFeatureUseCase,
    @inject(UpdateWorkItemUseCase) private readonly updateWorkItem: UpdateWorkItemUseCase,
    @inject('IWorkItemStateRepository') private readonly states: IWorkItemStateRepository
  ) {}

  async execute(input: ApproveHypothesisInput): Promise<ApproveHypothesisResult> {
    const found = await this.getWorkItem.execute(input.workItem);
    if (!found.ok) return found;
    const workItem = found.workItem;
    const key = workItemKey(workItem);

    const investigation = await this.findInvestigation(workItem, input.investigationId);
    if ('ok' in investigation) return investigation;
    if (investigation.featureId) {
      return {
        ok: false,
        error: `Hypothesis ${investigation.approvedHypothesisNumber} of ${key} was already approved as feature ${investigation.featureId}. Investigate again to approve another.`,
      };
    }
    const hypothesis = investigation.hypotheses.find((h) => h.number === input.hypothesis);
    if (!hypothesis) {
      return { ok: false, error: `${key} has no hypothesis ${input.hypothesis}.` };
    }

    const agentType = input.agentType ?? investigation.agentType;
    const featureInput: CreateFeatureInput = {
      userInput: buildFixPrompt(workItem, investigation, hypothesis),
      repositoryPath: investigation.repositoryPath,
      name: fixFeatureName(workItem, hypothesis),
      description: hypothesis.rootCause,
      buildMode: input.fullSpec ? BuildMode.Application : BuildMode.Fast,
      ...(agentType ? { agentType } : {}),
    };
    const { feature, shouldSpawn } = await this.createFeature.createRecord(featureInput);

    const approved: WorkItemInvestigation = {
      ...investigation,
      approvedHypothesisNumber: hypothesis.number,
      featureId: feature.id,
      updatedAt: new Date(),
    };
    await this.repo.update(approved);
    await this.moveToStarted(workItem);

    const started = this.createFeature.initializeAndSpawn(feature, featureInput, shouldSpawn).then(
      ({ warning }): FixStartOutcome => (warning ? { warning } : {}),
      (error: unknown): FixStartOutcome => ({
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return { ok: true, feature, investigation: approved, started };
  }

  private async findInvestigation(
    workItem: WorkItem,
    investigationId: string | undefined
  ): Promise<WorkItemInvestigation | Refusal> {
    const key = workItemKey(workItem);
    const investigations = await listInvestigations(this.repo, workItem.id);
    if (investigationId) {
      const named = investigations.find((i) => i.id === investigationId);
      if (!named) return { ok: false, error: `Investigation not found for ${key}.` };
      if (named.status !== InvestigationStatus.Completed) {
        return { ok: false, error: `That investigation of ${key} has not completed.` };
      }
      return named;
    }
    const latest = investigations.find((i) => i.status === InvestigationStatus.Completed);
    return latest ?? { ok: false, error: `${key} has no completed investigation.` };
  }

  private async moveToStarted(workItem: WorkItem): Promise<void> {
    const states = new ProjectStates(await this.states.listByProject(workItem.projectId));
    if (states.groupFor(workItem.stateId) === StateGroup.Started) return;
    const started = states.stateIn(StateGroup.Started);
    if (started) await this.updateWorkItem.execute(workItem.id, { stateId: started });
  }
}
