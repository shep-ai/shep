/**
 * Investigate a work item (spec 123): an agent reads the repository in a
 * throwaway checkout and returns ranked root-cause hypotheses.
 *
 * Two steps, so a surface can show the record before the agent finishes:
 * start() validates and records a Pending investigation; run() does the
 * reading and always ends Completed or Failed, removing the checkout however
 * it ends. The CLI awaits run(); the web server starts it and polls.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  InvestigationStatus,
  type AgentType,
  type WorkItem,
  type WorkItemInvestigation,
} from '../../../domain/generated/output.js';
import {
  INVESTIGATION_TIMEOUT_MS,
  isInvestigationActive,
  rankHypotheses,
  type RawInvestigationResult,
} from '../../../domain/shared/investigation.js';
import { workItemKey } from '../../../domain/shared/work-item-key.js';
import type { IInvestigationRepository } from '../../ports/output/repositories/investigation-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IInvestigationWorkspace,
  InvestigationCheckout,
} from '../../ports/output/services/investigation-workspace.interface.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
import { GetWorkItemUseCase } from '../work-items/get-work-item.use-case.js';
import { ResolveSpaceEnvironmentUseCase } from '../spaces/resolve-space-environment.use-case.js';
import {
  INVESTIGATION_MAX_TURNS,
  INVESTIGATION_RESULT_SCHEMA,
  INVESTIGATION_TOOLS,
  buildInvestigationPrompt,
} from './investigation-prompt.js';
import { listInvestigations } from './investigation-records.js';

export interface StartInvestigationInput {
  /** Work item id or key such as PAY-42. */
  workItem: string;
  /** Repository to read; defaults to the item's last one, then its project's application. */
  repositoryPath?: string;
  /** Agent to use; defaults to the configured agent. */
  agentType?: AgentType;
}

export type StartInvestigationResult =
  | { ok: true; workItem: WorkItem; investigation: WorkItemInvestigation }
  | { ok: false; error: string };

export const NO_HYPOTHESIS_ERROR = 'The agent found no hypothesis that fits the report.';

@injectable()
export class InvestigateWorkItemUseCase {
  constructor(
    @inject('IInvestigationRepository') private readonly repo: IInvestigationRepository,
    @inject(GetWorkItemUseCase) private readonly getWorkItem: GetWorkItemUseCase,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository,
    @inject('IInvestigationWorkspace') private readonly workspace: IInvestigationWorkspace,
    @inject('IStructuredAgentCaller') private readonly agent: IStructuredAgentCaller,
    @inject('ISettingsProvider') private readonly settings: ISettingsProvider,
    @inject(ResolveSpaceEnvironmentUseCase)
    private readonly spaceEnvironment: ResolveSpaceEnvironmentUseCase
  ) {}

  async start(input: StartInvestigationInput): Promise<StartInvestigationResult> {
    const found = await this.getWorkItem.execute(input.workItem);
    if (!found.ok) return found;
    const workItem = found.workItem;
    const key = workItemKey(workItem);

    const previous = await listInvestigations(this.repo, workItem.id);
    if (previous.some((investigation) => isInvestigationActive(investigation, new Date()))) {
      return { ok: false, error: `${key} is already being investigated.` };
    }

    const repositoryPath =
      input.repositoryPath ??
      previous[0]?.repositoryPath ??
      (await this.projectRepository(workItem));
    if (!repositoryPath) {
      return { ok: false, error: `Pick the repository to investigate ${key} in.` };
    }

    const agentType = input.agentType ?? this.settings.get().agent.type;
    const { agentRefusal } = await this.spaceEnvironment.execute(repositoryPath, agentType);
    if (agentRefusal) return { ok: false, error: agentRefusal };

    const now = new Date();
    const investigation: WorkItemInvestigation = {
      id: randomUUID(),
      workItemId: workItem.id,
      repositoryPath,
      status: InvestigationStatus.Pending,
      hypotheses: [],
      agentType,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.create(investigation);
    return { ok: true, workItem, investigation };
  }

  /** Runs a pending investigation to Completed or Failed and returns it. */
  async run(id: string): Promise<WorkItemInvestigation> {
    const pending = await this.repo.findById(id);
    if (!pending) throw new Error(`Investigation not found: ${id}`);
    if (pending.status !== InvestigationStatus.Pending) return pending;

    const startedAt = new Date();
    const running: WorkItemInvestigation = {
      ...pending,
      status: InvestigationStatus.Running,
      startedAt,
      updatedAt: startedAt,
    };
    await this.repo.update(running);

    let checkout: InvestigationCheckout | undefined;
    let outcome: Partial<WorkItemInvestigation>;
    try {
      const { environment, agentRefusal } = await this.spaceEnvironment.execute(
        running.repositoryPath,
        running.agentType
      );
      if (agentRefusal) throw new Error(agentRefusal);
      const found = await this.getWorkItem.execute(running.workItemId);
      if (!found.ok) throw new Error(found.error);

      checkout = await this.workspace.prepare(running.repositoryPath, running.id);
      const result = await this.agent.call<RawInvestigationResult>(
        buildInvestigationPrompt(found.workItem),
        INVESTIGATION_RESULT_SCHEMA,
        {
          cwd: checkout.path,
          tools: [...INVESTIGATION_TOOLS],
          maxTurns: INVESTIGATION_MAX_TURNS,
          disableMcp: true,
          silent: true,
          timeout: INVESTIGATION_TIMEOUT_MS,
          ...(running.agentType ? { agentType: running.agentType } : {}),
          environment,
        }
      );
      const hypotheses = rankHypotheses(result.hypotheses, checkout.path);
      const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
      outcome = {
        commitSha: checkout.commitSha,
        hypotheses,
        ...(summary ? { summary } : {}),
        ...(hypotheses.length > 0
          ? { status: InvestigationStatus.Completed }
          : { status: InvestigationStatus.Failed, error: NO_HYPOTHESIS_ERROR }),
      };
    } catch (error) {
      outcome = {
        ...(checkout ? { commitSha: checkout.commitSha } : {}),
        status: InvestigationStatus.Failed,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (checkout) await this.workspace.dispose(running.repositoryPath, checkout);
    }

    const finishedAt = new Date();
    const finished: WorkItemInvestigation = {
      ...running,
      ...outcome,
      finishedAt,
      updatedAt: finishedAt,
    };
    await this.repo.update(finished);
    return finished;
  }

  private async projectRepository(workItem: WorkItem): Promise<string | undefined> {
    const project = await this.projects.findById(workItem.projectId);
    if (!project?.applicationId) return undefined;
    return (await this.applications.findById(project.applicationId))?.repositoryPath;
  }
}
