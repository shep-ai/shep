/**
 * The brief a built opportunity hands to its work item (spec 126): the
 * problem, the numbers behind the decision and the signals as evidence, so
 * the agents that plan and build it see why it matters.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import type { Opportunity, Signal } from '../generated/output';
import type { OpportunityEvidence } from './opportunity-score';

/** Signals quoted in a brief; the rest are counted. */
export const MAX_BRIEF_SIGNALS = 10;

function signalLine(signal: Signal): string {
  const facts = [
    signal.kind,
    signal.customer,
    signal.monthlyRevenue ? `${signal.monthlyRevenue}/month` : undefined,
    signal.urgent ? 'urgent' : undefined,
  ].filter(Boolean);
  const link = signal.url ? ` (${signal.url})` : '';
  const detail = signal.detail?.trim() ? ` — ${signal.detail.trim().replace(/\s+/g, ' ')}` : '';
  return `- ${signal.title}${link} [${facts.join(', ')}]${detail}`;
}

export function opportunityBrief(
  opportunity: Opportunity,
  signals: readonly Signal[],
  evidence: OpportunityEvidence
): string {
  const parts: string[] = [];
  if (opportunity.problem?.trim()) parts.push(`## Problem\n\n${opportunity.problem.trim()}`);
  parts.push(
    [
      '## Why now',
      '',
      `- ${evidence.signals} signal(s) from ${evidence.customers} customer(s)`,
      `- Revenue at stake: ${evidence.revenueAtStake}/month`,
      `- Urgent signals: ${evidence.urgentSignals}`,
      `- Review estimate: ${opportunity.reviewHours} h at ${Math.round(opportunity.confidence * 100)}% confidence`,
    ].join('\n')
  );
  if (signals.length > 0) {
    const quoted = signals.slice(0, MAX_BRIEF_SIGNALS).map(signalLine);
    const more = signals.length - quoted.length;
    if (more > 0) quoted.push(`- …and ${more} more`);
    parts.push(`## Evidence\n\n${quoted.join('\n')}`);
  }
  return parts.join('\n\n');
}
