/**
 * TriageIncidentUseCase (spec 129)
 *
 * Reads the incident's workload (rollout status, events, logs), asks the
 * agent — under the space's agent rules and environment, with no tools — for
 * a summary, ranked hypotheses and at most one runtime action, and records
 * them on the timeline. The action goes through RuntimeActionsUseCase, so the
 * space's policy decides whether it runs now or waits for approval.
 */

import { injectable, inject } from 'tsyringe';
import {
  ActionProposer,
  IncidentEventKind,
  IncidentStatus,
  type AgentType,
  type RuntimeAction,
} from '../../../domain/generated/output.js';
import {
  parseActionProposal,
  rankIncidentHypotheses,
  type IncidentHypothesis,
} from '../../../domain/shared/incidents.js';
import { spaceAgent, spaceEnvironment } from '../../../domain/shared/space-environment.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
} from '../../ports/output/repositories/incident-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type {
  IRuntimeController,
  RuntimeEvidence,
} from '../../ports/output/services/runtime-controller.interface.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';
import { errorMessage } from '../connections/connection-refs.js';
import { failure, type OpportunityResult } from '../opportunities/opportunity-scope.js';
import { appendEvent, runtimeTarget } from './incident-timeline.js';
import { RuntimeActionsUseCase } from './runtime-actions.use-case.js';
import { TRIAGE_SCHEMA, triagePrompt, type TriageAnswer } from './triage-prompt.js';

/** The agent's budget for one triage. */
export const TRIAGE_TIMEOUT_MS = 5 * 60_000;
const TRIAGE_MAX_TURNS = 3;
/** Characters of each evidence section kept on the timeline (the agent reads it all). */
const EVIDENCE_SECTION_CHARS = 800;

/** Rollout status, recent events and the logs tail, each labelled and bounded. */
function evidencePreview(evidence: RuntimeEvidence): string {
  const sections: [string, string][] = [
    ['Rollout status', evidence.status.slice(0, EVIDENCE_SECTION_CHARS)],
    ['Recent events', evidence.events.slice(-EVIDENCE_SECTION_CHARS)],
    ['Recent logs', evidence.logs.slice(-EVIDENCE_SECTION_CHARS)],
  ];
  return sections
    .filter(([, text]) => text.trim() !== '')
    .map(([title, text]) => `${title}:\n${text.trim()}`)
    .join('\n\n');
}

export interface TriageResult {
  summary: string;
  hypotheses: IncidentHypothesis[];
  action?: RuntimeAction;
}

@injectable()
export class TriageIncidentUseCase {
  constructor(
    @inject('IIncidentRepository') private readonly incidents: IIncidentRepository,
    @inject('IIncidentEventRepository') private readonly events: IIncidentEventRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IRuntimeController') private readonly runtime: IRuntimeController,
    @inject('IStructuredAgentCaller') private readonly agent: IStructuredAgentCaller,
    @inject(RuntimeActionsUseCase) private readonly actions: RuntimeActionsUseCase
  ) {}

  async execute(
    incidentId: string,
    agentType?: AgentType
  ): Promise<OpportunityResult<TriageResult>> {
    const incident = await this.incidents.findById(incidentId.trim());
    if (!incident) return failure(`No incident "${incidentId}".`);
    if (incident.status === IncidentStatus.Resolved)
      return failure(`${incident.title} is resolved.`);
    const space = await this.spaces.findById(incident.spaceId);
    const agent = spaceAgent(space?.agentSettings, agentType);
    if (!agent.ok)
      return failure(`The ${space?.name ?? 'incident'} space does not allow ${agentType} agents.`);

    const target = runtimeTarget(incident);
    const evidence = target ? await this.runtime.evidence(target) : undefined;
    if (evidence) {
      await appendEvent(
        this.events,
        incident.id,
        IncidentEventKind.Evidence,
        evidencePreview(evidence)
      );
    }

    let answer: TriageAnswer;
    try {
      answer = await this.agent.call<TriageAnswer>(
        triagePrompt(incident, evidence),
        TRIAGE_SCHEMA,
        {
          allowedTools: [],
          disableMcp: true,
          silent: true,
          maxTurns: TRIAGE_MAX_TURNS,
          timeout: TRIAGE_TIMEOUT_MS,
          environment: spaceEnvironment(space?.agentSettings),
          ...(agent.agentType ? { agentType: agent.agentType } : {}),
        }
      );
    } catch (error: unknown) {
      const message = errorMessage(error);
      await appendEvent(
        this.events,
        incident.id,
        IncidentEventKind.Note,
        `Triage failed: ${message}`
      );
      return failure(message);
    }

    const summary = typeof answer.summary === 'string' ? answer.summary.trim() : '';
    if (summary) await appendEvent(this.events, incident.id, IncidentEventKind.Note, summary);
    const hypotheses = rankIncidentHypotheses(answer.hypotheses);
    for (const hypothesis of hypotheses) {
      await appendEvent(
        this.events,
        incident.id,
        IncidentEventKind.Hypothesis,
        `${hypothesis.cause} (${hypothesis.confidence})${hypothesis.evidence ? ` — ${hypothesis.evidence}` : ''}`
      );
    }

    const proposal = parseActionProposal(answer.action);
    if (!proposal || !target) return { ok: true, summary, hypotheses };
    const proposed = await this.actions.propose(incident.id, proposal, ActionProposer.Agent);
    return proposed.ok
      ? { ok: true, summary, hypotheses, action: proposed.action }
      : { ok: true, summary, hypotheses };
  }
}
