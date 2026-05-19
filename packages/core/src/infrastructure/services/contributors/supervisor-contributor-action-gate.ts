/**
 * Supervisor-backed Contributor Action Gate (spec 097, NFR-5).
 *
 * Concrete adapter for {@link IContributorActionGate} that funnels every
 * contributor pipeline side-effect through {@link ISupervisorAgent}. The
 * supervisor is the single chokepoint where autonomy / approval policy
 * is applied — this adapter only translates the narrow contributor port
 * into the generic supervisor evaluation envelope.
 *
 * Verdict mapping:
 *   - `approve` / `advise` → approved (autonomous or advisory greenlight)
 *   - `reject`            → denied (policy explicitly blocked it)
 *   - `escalate`          → denied (needs a human; gate must not silently fire)
 *
 * Per the port contract, this adapter MUST resolve (never throw). Any
 * supervisor failure is captured as a denial with the error in the
 * rationale so callers can short-circuit and audit-log the outage.
 */

import { inject, injectable } from 'tsyringe';

import {
  SupervisorAutonomy,
  SupervisorScopeType,
  SupervisorVerdict,
  type SupervisorPolicy,
} from '../../../domain/generated/output.js';
import type {
  ISupervisorAgent,
  SupervisorMessageEvent,
} from '../../../application/ports/output/agents/supervisor-agent.interface.js';
import type {
  ContributorGateDecision,
  ContributorGateInput,
  IContributorActionGate,
} from '../../../application/ports/output/services/contributor-action-gate.interface.js';

const CONTRIBUTOR_GATE_ACTOR = 'contributor-onboarding';
const SUPERVISOR_TARGET = 'supervisor';

/** Default policy used until a persisted contributor policy is wired. */
function defaultContributorPolicy(now: Date): SupervisorPolicy {
  const iso = now.toISOString();
  return {
    id: 'contributor-onboarding-default',
    createdAt: iso,
    updatedAt: iso,
    scopeType: SupervisorScopeType.global,
    enabled: true,
    autonomyLevel: SupervisorAutonomy.advisory,
  };
}

@injectable()
export class SupervisorContributorActionGate implements IContributorActionGate {
  constructor(
    @inject('ISupervisorAgent')
    private readonly supervisor: ISupervisorAgent
  ) {}

  async gate(input: ContributorGateInput): Promise<ContributorGateDecision> {
    const now = new Date();
    const sourceEventId = `contributor-action-${input.kind}-${now.getTime()}`;
    const event: SupervisorMessageEvent = {
      kind: 'message',
      scopeType: SupervisorScopeType.global,
      messageId: sourceEventId,
      messageKind: input.kind,
      fromActor: CONTRIBUTOR_GATE_ACTOR,
      toTarget: SUPERVISOR_TARGET,
      payload: JSON.stringify({
        summary: input.summary,
        context: input.context ?? null,
      }),
      sourceEventId,
    };

    try {
      const decision = await this.supervisor.evaluate({
        event,
        policy: defaultContributorPolicy(now),
      });
      const approved =
        decision.verdict === SupervisorVerdict.approve ||
        decision.verdict === SupervisorVerdict.advise;
      return { approved, rationale: decision.rationale };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        approved: false,
        rationale: `supervisor evaluation failed: ${message}`,
      };
    }
  }
}
