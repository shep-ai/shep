/**
 * Discovery proposals (spec 128): what an agent proposed, checked before
 * anything is written. A proposal is kept only when it cites at least one
 * unlinked signal of the space it was shown and does not repeat the title of
 * an open opportunity (or of another kept proposal); its estimate and
 * confidence are clamped to the ranges people can enter.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import { MAX_REVIEW_HOURS, MIN_REVIEW_HOURS } from './opportunity-score';

/** Most proposals one run may create. */
export const MAX_DISCOVERY_PROPOSALS = 5;
/** Most unlinked signals shown to the agent, newest first. */
export const MAX_DISCOVERY_SIGNALS = 60;
/** Hours between scheduled discovery runs: at least hourly, at most monthly. */
export const MIN_DISCOVERY_EVERY_HOURS = 1;
export const MAX_DISCOVERY_EVERY_HOURS = 720;

/** Most knowledge document titles shown to the agent. */
export const MAX_DISCOVERY_DOCUMENTS = 20;

const MAX_TITLE = 120;
const DEFAULT_PROPOSAL_HOURS = 4;
const DEFAULT_PROPOSAL_CONFIDENCE = 0.5;

/** One proposal as the agent's JSON schema allows it. */
export interface RawDiscoveryProposal {
  title?: unknown;
  problem?: unknown;
  outline?: unknown;
  rationale?: unknown;
  signalIds?: unknown;
  reviewHours?: unknown;
  confidence?: unknown;
}

export interface DiscoveryProposal {
  title: string;
  problem: string;
  /** What the agent suggests building, and why now. */
  brief: string;
  signalIds: string[];
  reviewHours: number;
  confidence: number;
}

export interface CheckedProposals {
  kept: DiscoveryProposal[];
  dropped: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ');
}

export function checkProposals(
  raw: readonly RawDiscoveryProposal[],
  unlinkedSignalIds: ReadonlySet<string>,
  openTitles: readonly string[]
): CheckedProposals {
  const seen = new Set(openTitles.map(titleKey));
  const kept: DiscoveryProposal[] = [];
  let dropped = 0;
  for (const proposal of raw) {
    const title = text(proposal.title).slice(0, MAX_TITLE);
    const cited = Array.isArray(proposal.signalIds)
      ? [...new Set(proposal.signalIds.filter((id): id is string => typeof id === 'string'))]
      : [];
    const signalIds = cited.filter((id) => unlinkedSignalIds.has(id));
    if (
      !title ||
      signalIds.length === 0 ||
      seen.has(titleKey(title)) ||
      kept.length >= MAX_DISCOVERY_PROPOSALS
    ) {
      dropped += 1;
      continue;
    }
    seen.add(titleKey(title));
    kept.push({
      title,
      problem: text(proposal.problem),
      brief: [text(proposal.outline), text(proposal.rationale)].filter(Boolean).join('\n\n'),
      signalIds,
      reviewHours: clamp(
        proposal.reviewHours,
        MIN_REVIEW_HOURS,
        MAX_REVIEW_HOURS,
        DEFAULT_PROPOSAL_HOURS
      ),
      confidence: clamp(proposal.confidence, 0, 1, DEFAULT_PROPOSAL_CONFIDENCE),
    });
  }
  return { kept, dropped };
}
