/**
 * The discovery prompt and answer schema (spec 128): a space's loose
 * evidence, its open opportunities and team knowledge titles, and the shape
 * of the proposals the agent returns.
 */

import type { Signal } from '../../../domain/generated/output.js';
import {
  MAX_DISCOVERY_PROPOSALS,
  type RawDiscoveryProposal,
} from '../../../domain/shared/discovery-proposals.js';
import type { FeedbackTheme } from '../../../domain/shared/feedback-themes.js';

/** Characters of a signal's detail shown to the agent. */
const DETAIL_CHARS = 400;

export interface DiscoveryEvidence {
  spaceName: string;
  signals: Signal[];
  themes: FeedbackTheme[];
  openTitles: string[];
  documentTitles: string[];
}

export interface DiscoveryAnswer {
  proposals: RawDiscoveryProposal[];
}

export const DISCOVERY_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      maxItems: MAX_DISCOVERY_PROPOSALS,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          outline: { type: 'string' },
          rationale: { type: 'string' },
          signalIds: { type: 'array', items: { type: 'string' } },
          reviewHours: { type: 'number' },
          confidence: { type: 'number' },
        },
        required: [
          'title',
          'problem',
          'outline',
          'rationale',
          'signalIds',
          'reviewHours',
          'confidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
} as const;

function signalLine(signal: Signal): string {
  const facts = [
    signal.kind,
    signal.customer,
    signal.monthlyRevenue ? `${signal.monthlyRevenue}/month` : undefined,
    signal.urgent ? 'urgent' : undefined,
  ].filter(Boolean);
  const detail = signal.detail
    ? ` — ${signal.detail.replace(/\s+/g, ' ').slice(0, DETAIL_CHARS)}`
    : '';
  return `- [${signal.id}] ${signal.title} (${facts.join(', ')})${detail}`;
}

function list(items: string[], empty: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : empty;
}

export function discoveryPrompt(evidence: DiscoveryEvidence): string {
  return `You are the product discovery agent for the "${evidence.spaceName}" space. Read the evidence below and propose at most ${MAX_DISCOVERY_PROPOSALS} opportunities worth building next.

Rules:
- Every proposal must cite the ids (in square brackets) of the signals it rests on. Cite only ids listed below.
- Do not propose anything already open (listed under "Open opportunities").
- Prefer opportunities that many customers, revenue or urgent signals stand behind.
- reviewHours: hours a person will spend reviewing and merging the change (0.5 to 200).
- confidence: from 0 to 1, how sure you are it delivers the value.
- outline: what to build, in a few sentences. rationale: why now, from the evidence.
- Propose nothing rather than something the evidence does not support.

## Signals not linked to any opportunity

${evidence.signals.map(signalLine).join('\n')}

## Themes among them

${list(
  evidence.themes.map((theme) => `${theme.label}: ${theme.signals.map((s) => s.id).join(', ')}`),
  '(none)'
)}

## Open opportunities

${list(evidence.openTitles, '(none)')}

## Team knowledge documents

${list(evidence.documentTitles, '(none)')}`;
}
