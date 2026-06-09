/**
 * countCampaignProgress — pure-domain progress counter.
 *
 * Feature 098, phase 6 (task-38 supporting helper). Given a list of
 * findings drawn from a campaign's targetQuery and the active
 * SecurityPolicy + clock, returns `(total, closed, atRisk, blocked)`
 * (FR-17).
 *
 * Bucketing rules:
 *  - total   : every finding in the list
 *  - closed  : findings whose state is Resolved or Closed
 *  - atRisk  : open findings whose SLA band is AtRisk or Breached
 *  - blocked : findings with state Exception (masked by an active risk
 *              exception — won't progress until the exception is revoked
 *              or expires)
 *
 * Pure: no infra imports, no Date.now(). Time is threaded via `now`.
 */

import {
  FindingState,
  SlaState,
  type SecurityFinding,
  type SecurityPolicy,
} from '../../generated/output';
import { computeSlaState } from '../sla/compute-sla-state';

export interface CampaignProgress {
  total: number;
  closed: number;
  atRisk: number;
  blocked: number;
}

export interface CountProgressInputs {
  findings: SecurityFinding[];
  policy: SecurityPolicy;
  now: Date;
}

const CLOSED_STATES: FindingState[] = [FindingState.Resolved, FindingState.Closed];

export function countCampaignProgress(inputs: CountProgressInputs): CampaignProgress {
  const { findings, policy, now } = inputs;
  let closed = 0;
  let atRisk = 0;
  let blocked = 0;

  for (const finding of findings) {
    if (CLOSED_STATES.includes(finding.state)) {
      closed += 1;
      continue;
    }

    if (finding.state === FindingState.Exception) {
      blocked += 1;
      continue;
    }

    const sla = computeSlaState({
      discoveredAt: finding.discoveredAt as Date,
      severity: finding.canonicalSeverity,
      policy,
      now,
    });
    if (sla === SlaState.AtRisk || sla === SlaState.Breached) {
      atRisk += 1;
    }
  }

  return { total: findings.length, closed, atRisk, blocked };
}
