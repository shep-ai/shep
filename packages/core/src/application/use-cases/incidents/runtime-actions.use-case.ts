/**
 * RuntimeActionsUseCase (spec 129)
 *
 * Proposes, approves, rejects and runs restarts, rollbacks and scales of an
 * incident's workload. An action runs at once when a person proposes it or
 * the space lets shep run its kind; otherwise it waits for approval. After it
 * runs, shep waits for the rollout and records whether the workload
 * recovered; recovery mitigates an open incident. Every step is on the
 * incident's timeline.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  ActionProposer,
  IncidentEventKind,
  IncidentStatus,
  RuntimeActionKind,
  RuntimeActionStatus,
  type Incident,
  type RuntimeAction,
} from '../../../domain/generated/output.js';
import {
  RECOVERY_TIMEOUT_SECONDS,
  actionLabel,
  isAutoApproved,
  parseActionProposal,
  type ActionProposal,
} from '../../../domain/shared/incidents.js';
import type {
  IIncidentEventRepository,
  IIncidentRepository,
  IRuntimeActionRepository,
} from '../../ports/output/repositories/incident-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type {
  IRuntimeController,
  RuntimeTarget,
} from '../../ports/output/services/runtime-controller.interface.js';
import { errorMessage } from '../connections/connection-refs.js';
import { failure, type OpportunityResult } from '../opportunities/opportunity-scope.js';
import { appendEvent, runtimeTarget } from './incident-timeline.js';

type ActionResult = OpportunityResult<{ action: RuntimeAction }>;

@injectable()
export class RuntimeActionsUseCase {
  constructor(
    @inject('IIncidentRepository') private readonly incidents: IIncidentRepository,
    @inject('IIncidentEventRepository') private readonly events: IIncidentEventRepository,
    @inject('IRuntimeActionRepository') private readonly actions: IRuntimeActionRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IRuntimeController') private readonly runtime: IRuntimeController
  ) {}

  async propose(
    incidentId: string,
    proposal: ActionProposal,
    proposedBy: ActionProposer
  ): Promise<ActionResult> {
    const checked = parseActionProposal(proposal);
    if (!checked) return failure('A scale needs a whole number of replicas from 0 to 100.');
    const incident = await this.incidents.findById(incidentId.trim());
    if (!incident) return failure(`No incident "${incidentId}".`);
    if (incident.status === IncidentStatus.Resolved) {
      return failure(`${incident.title} is resolved.`);
    }
    if (!runtimeTarget(incident)) {
      return failure(`${incident.title} names no workload to act on.`);
    }

    const now = new Date();
    const action: RuntimeAction = {
      id: randomUUID(),
      incidentId: incident.id,
      kind: checked.kind,
      ...(checked.kind === RuntimeActionKind.Scale ? { replicas: checked.replicas } : {}),
      status: RuntimeActionStatus.Proposed,
      proposedBy,
      reason: checked.reason || 'No reason given',
      createdAt: now,
      updatedAt: now,
    };
    await this.actions.create(action);
    const label = actionLabel(action.kind, action.replicas);
    await appendEvent(
      this.events,
      incident.id,
      IncidentEventKind.ActionProposed,
      `${proposedBy} proposed ${label}: ${action.reason}`
    );

    const space = await this.spaces.findById(incident.spaceId);
    const runsNow =
      proposedBy === ActionProposer.Person || isAutoApproved(space?.agentSettings, action.kind);
    if (!runsNow) return { ok: true, action };
    const why =
      proposedBy === ActionProposer.Person
        ? 'proposed by a person'
        : `the ${space?.name ?? 'space'} space allows ${label}`;
    return this.run(incident, action, `Approved: ${why}`);
  }

  async approve(actionId: string): Promise<ActionResult> {
    const found = await this.pending(actionId);
    if (!found.ok) return found;
    return this.run(found.incident, found.action, 'Approved by a person');
  }

  async reject(actionId: string, reason?: string): Promise<ActionResult> {
    const found = await this.pending(actionId);
    if (!found.ok) return found;
    const now = new Date();
    const rejected = {
      ...found.action,
      status: RuntimeActionStatus.Rejected,
      decidedAt: now,
      updatedAt: now,
    };
    await this.actions.update(rejected);
    await appendEvent(
      this.events,
      found.incident.id,
      IncidentEventKind.ActionRejected,
      `Rejected ${actionLabel(rejected.kind, rejected.replicas)}${reason?.trim() ? `: ${reason.trim()}` : ''}`
    );
    return { ok: true, action: rejected };
  }

  private async pending(
    actionId: string
  ): Promise<OpportunityResult<{ action: RuntimeAction; incident: Incident }>> {
    const action = await this.actions.findById(actionId.trim());
    if (!action) return failure(`No runtime action "${actionId}".`);
    if (action.status !== RuntimeActionStatus.Proposed) {
      return failure(`That action is ${action.status}; only proposed actions can be decided.`);
    }
    const incident = await this.incidents.findById(action.incidentId);
    if (!incident) return failure(`No incident "${action.incidentId}".`);
    if (incident.status === IncidentStatus.Resolved)
      return failure(`${incident.title} is resolved.`);
    return { ok: true, action, incident };
  }

  private execute(target: RuntimeTarget, action: RuntimeAction): Promise<string> {
    switch (action.kind) {
      case RuntimeActionKind.Restart:
        return this.runtime.restart(target);
      case RuntimeActionKind.Rollback:
        return this.runtime.rollback(target);
      case RuntimeActionKind.Scale:
        return this.runtime.scale(target, action.replicas ?? 0);
    }
  }

  private async run(
    incident: Incident,
    proposed: RuntimeAction,
    approval: string
  ): Promise<ActionResult> {
    const target = runtimeTarget(incident);
    if (!target) return failure(`${incident.title} names no workload to act on.`);
    const label = actionLabel(proposed.kind, proposed.replicas);
    const decidedAt = new Date();
    let action: RuntimeAction = {
      ...proposed,
      status: RuntimeActionStatus.Approved,
      decidedAt,
      updatedAt: decidedAt,
    };
    await this.actions.update(action);
    await appendEvent(
      this.events,
      incident.id,
      IncidentEventKind.ActionApproved,
      `${approval}: ${label}`
    );

    try {
      const output = await this.execute(target, action);
      action = { ...action, status: RuntimeActionStatus.Succeeded, output, executedAt: new Date() };
      await appendEvent(
        this.events,
        incident.id,
        IncidentEventKind.ActionSucceeded,
        `${label}: ${output}`
      );
    } catch (error: unknown) {
      const output = errorMessage(error);
      action = {
        ...action,
        status: RuntimeActionStatus.Failed,
        output,
        executedAt: new Date(),
        updatedAt: new Date(),
      };
      await this.actions.update(action);
      await appendEvent(
        this.events,
        incident.id,
        IncidentEventKind.ActionFailed,
        `${label} failed: ${output}`
      );
      return { ok: true, action };
    }

    const check = await this.runtime.verify(target, RECOVERY_TIMEOUT_SECONDS);
    action = { ...action, recovered: check.recovered, updatedAt: new Date() };
    await this.actions.update(action);
    await appendEvent(
      this.events,
      incident.id,
      check.recovered ? IncidentEventKind.Recovered : IncidentEventKind.NotRecovered,
      check.detail || (check.recovered ? 'Rollout ready' : 'Rollout not ready')
    );
    if (check.recovered && incident.status === IncidentStatus.Open) {
      const now = new Date();
      await this.incidents.update({
        ...incident,
        status: IncidentStatus.Mitigated,
        mitigatedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true, action };
  }
}
