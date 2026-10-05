/**
 * RunDiscoveryUseCase (spec 128)
 *
 * One discovery pass over a space: gather its loose evidence, ask the agent
 * (under the space's agent rules and environment, with no tools) for
 * proposals, keep those backed by real loose signals and new titles, create
 * them as discovered opportunities with their signals linked, and record the
 * run. One run per space at a time.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  DiscoveryRunStatus,
  OpportunitySource,
  type AgentType,
  type DiscoveryRun,
  type Opportunity,
} from '../../../domain/generated/output.js';
import {
  MAX_DISCOVERY_DOCUMENTS,
  MAX_DISCOVERY_SIGNALS,
  checkProposals,
} from '../../../domain/shared/discovery-proposals.js';
import { groupIntoThemes } from '../../../domain/shared/feedback-themes.js';
import { OPEN_STATUSES } from '../../../domain/shared/opportunity-score.js';
import { spaceAgent, spaceEnvironment } from '../../../domain/shared/space-environment.js';
import type { IDiscoveryRunRepository } from '../../ports/output/repositories/discovery-run-repository.interface.js';
import type {
  IOpportunityRepository,
  ISignalRepository,
} from '../../ports/output/repositories/opportunity-repository.interface.js';
import type { IKnowledgeDocumentRepository } from '../../ports/output/repositories/knowledge-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';
import { ManageOpportunitiesUseCase } from '../opportunities/manage-opportunities.use-case.js';
import { ManageSignalsUseCase } from '../opportunities/manage-signals.use-case.js';
import {
  failure,
  resolveScope,
  type OpportunityResult,
} from '../opportunities/opportunity-scope.js';
import { errorMessage } from '../connections/connection-refs.js';
import { DISCOVERY_SCHEMA, discoveryPrompt, type DiscoveryAnswer } from './discovery-prompt.js';

/** The agent's budget for one run. */
export const DISCOVERY_TIMEOUT_MS = 10 * 60_000;
/** A run still Running after this long was lost (the process died) and counts as failed. */
export const DISCOVERY_STALE_MS = DISCOVERY_TIMEOUT_MS + 5 * 60_000;
const DISCOVERY_MAX_TURNS = 3;

export interface RunDiscoveryInput {
  /** Space id or slug; the default space when omitted. */
  space?: string;
  agentType?: AgentType;
}

@injectable()
export class RunDiscoveryUseCase {
  constructor(
    @inject('IDiscoveryRunRepository') private readonly runs: IDiscoveryRunRepository,
    @inject('ISignalRepository') private readonly signals: ISignalRepository,
    @inject('IOpportunityRepository') private readonly opportunities: IOpportunityRepository,
    @inject('IKnowledgeDocumentRepository')
    private readonly documents: IKnowledgeDocumentRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('IStructuredAgentCaller') private readonly agent: IStructuredAgentCaller,
    @inject(ManageOpportunitiesUseCase) private readonly manage: ManageOpportunitiesUseCase,
    @inject(ManageSignalsUseCase) private readonly links: ManageSignalsUseCase
  ) {}

  async execute(
    input: RunDiscoveryInput = {}
  ): Promise<OpportunityResult<{ run: DiscoveryRun; opportunities: Opportunity[] }>> {
    const scope = await resolveScope(
      this.spaces,
      this.productLines,
      input.space ? { space: input.space } : {}
    );
    if (!scope.ok) return scope;
    const { space } = scope;

    const settings = space.agentSettings;
    const agent = spaceAgent(settings, input.agentType);
    if (!agent.ok)
      return failure(`The ${space.name} space does not allow ${input.agentType} agents.`);
    const { agentType } = agent;

    const busy = await this.clearStale(space.id);
    if (busy) return failure(`Discovery is already running in ${space.name}.`);

    const loose = (await this.signals.list({ spaceId: space.id, unlinked: true })).slice(
      0,
      MAX_DISCOVERY_SIGNALS
    );
    if (loose.length === 0) return failure(`${space.name} has no unlinked signals to read.`);
    const [open, documents] = await Promise.all([
      this.opportunities.list({ spaceId: space.id, statuses: OPEN_STATUSES }),
      this.documents.listBySpace(space.id),
    ]);
    const openTitles = open.map((opportunity) => opportunity.title);

    const now = new Date();
    let run: DiscoveryRun = {
      id: randomUUID(),
      spaceId: space.id,
      status: DiscoveryRunStatus.Running,
      ...(agentType ? { agentType } : {}),
      signalsRead: loose.length,
      proposed: 0,
      dropped: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.runs.create(run);

    let answer: DiscoveryAnswer;
    try {
      answer = await this.agent.call<DiscoveryAnswer>(
        discoveryPrompt({
          spaceName: space.name,
          signals: loose,
          themes: groupIntoThemes(loose),
          openTitles,
          documentTitles: documents.slice(0, MAX_DISCOVERY_DOCUMENTS).map((d) => d.title),
        }),
        DISCOVERY_SCHEMA,
        {
          allowedTools: [],
          disableMcp: true,
          silent: true,
          maxTurns: DISCOVERY_MAX_TURNS,
          timeout: DISCOVERY_TIMEOUT_MS,
          environment: spaceEnvironment(settings),
          ...(agentType ? { agentType } : {}),
        }
      );
    } catch (error: unknown) {
      const message = errorMessage(error);
      await this.finish(run, { status: DiscoveryRunStatus.Failed, error: message });
      return failure(message);
    }

    const { kept, dropped } = checkProposals(
      Array.isArray(answer.proposals) ? answer.proposals : [],
      new Set(loose.map((signal) => signal.id)),
      openTitles
    );
    const created: Opportunity[] = [];
    for (const proposal of kept) {
      const result = await this.manage.create({
        space: space.id,
        title: proposal.title,
        problem: proposal.problem,
        brief: proposal.brief,
        reviewHours: proposal.reviewHours,
        confidence: proposal.confidence,
        source: OpportunitySource.Discovery,
      });
      if (!result.ok) continue;
      for (const signalId of proposal.signalIds)
        await this.links.link(signalId, result.opportunity.id);
      created.push(result.opportunity);
    }
    run = await this.finish(run, {
      status: DiscoveryRunStatus.Succeeded,
      proposed: created.length,
      dropped: dropped + kept.length - created.length,
    });
    return { ok: true, run, opportunities: created };
  }

  /** True while a recent run is still going; a lost one is marked failed. */
  private async clearStale(spaceId: string): Promise<boolean> {
    const latest = await this.runs.latest(spaceId);
    if (latest?.status !== DiscoveryRunStatus.Running) return false;
    if (Date.now() - latest.createdAt.getTime() < DISCOVERY_STALE_MS) return true;
    await this.finish(latest, {
      status: DiscoveryRunStatus.Failed,
      error: 'The run never finished.',
    });
    return false;
  }

  private async finish(
    run: DiscoveryRun,
    change: Partial<Pick<DiscoveryRun, 'status' | 'proposed' | 'dropped' | 'error'>>
  ): Promise<DiscoveryRun> {
    const now = new Date();
    const finished = { ...run, ...change, finishedAt: now, updatedAt: now };
    await this.runs.update(finished);
    return finished;
  }
}
