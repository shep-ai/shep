/**
 * ClassifyIntoLaneUseCase — spec 097, FR-26.
 *
 * Hybrid lane classifier: deterministic rules first (title-prefix, body-
 * keyword, label-hint heuristics), with agent fallback only when the rules
 * report `unknown` or low-confidence multi-lane match. Returns the
 * TypeSpec-defined `ContributorLane` enum end-to-end (NFR-3 — no raw
 * strings for domain concepts).
 *
 * Mirrors the pattern used by `auto-triage-intake-item`: cheap rule
 * cascade for the easy cases, LLM escalation only when judgment is
 * actually needed.
 */

import { inject, injectable } from 'tsyringe';

import { ContributorLane } from '../../../domain/generated/output.js';
import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

export interface ClassifyIntoLaneInput {
  /** Issue title — usually the strongest signal via prefix conventions. */
  title: string;
  /** Issue body — used by keyword heuristics and as agent context. */
  body: string;
  /** Existing labels on the issue (lowercased). May influence routing. */
  existingLabels?: readonly string[];
}

export interface ClassifyIntoLaneResult {
  lane: ContributorLane;
  /** Source of the decision — useful for audit, opt-out, and tests. */
  source: 'rules' | 'agent';
  /** Short rationale; safe to surface in PR comments / dashboards. */
  rationale: string;
}

interface RuleMatch {
  lane: ContributorLane;
  rationale: string;
}

const TITLE_PREFIX_LANES: readonly (readonly [RegExp, ContributorLane])[] = [
  [/^(docs?|documentation)\s*[:(-]/i, ContributorLane.Docs],
  [/^(web|ui|ux|frontend)\s*[:(-]/i, ContributorLane.Ui],
  [/^(cli|terminal)\s*[:(-]/i, ContributorLane.Cli],
  [/^(agents?|llm|ai)\s*[:(-]/i, ContributorLane.Agents],
  [/^(infra|build|ci|cd|deps|chore|release)\s*[:(-]/i, ContributorLane.Infra],
];

const LABEL_LANE_HINTS: Readonly<Record<string, ContributorLane>> = {
  docs: ContributorLane.Docs,
  documentation: ContributorLane.Docs,
  web: ContributorLane.Ui,
  ui: ContributorLane.Ui,
  frontend: ContributorLane.Ui,
  cli: ContributorLane.Cli,
  agents: ContributorLane.Agents,
  agent: ContributorLane.Agents,
  ai: ContributorLane.Agents,
  infra: ContributorLane.Infra,
  ci: ContributorLane.Infra,
  build: ContributorLane.Infra,
  deps: ContributorLane.Infra,
};

const BODY_KEYWORD_LANES: readonly (readonly [RegExp, ContributorLane])[] = [
  [/\b(prompt|llm|agent[a-z\s]+)\b/i, ContributorLane.Agents],
  [/\b(react|component|storybook|tailwind|web ui|dashboard)\b/i, ContributorLane.Ui],
  [/\b(commander|ts-node|cli command|terminal)\b/i, ContributorLane.Cli],
  [/\b(typespec|migration|sqlite|github actions|workflow)\b/i, ContributorLane.Infra],
  [/\b(readme|docs|markdown|tutorial|documentation)\b/i, ContributorLane.Docs],
];

@injectable()
export class ClassifyIntoLaneUseCase {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: ClassifyIntoLaneInput): Promise<ClassifyIntoLaneResult> {
    const ruleHit = applyRules(input);
    if (ruleHit) {
      return { lane: ruleHit.lane, source: 'rules', rationale: ruleHit.rationale };
    }
    return await this.classifyWithAgent(input);
  }

  private async classifyWithAgent(input: ClassifyIntoLaneInput): Promise<ClassifyIntoLaneResult> {
    const executor = await this.agentProvider.getExecutor();
    const allowed = Object.values(ContributorLane).join(', ');
    const prompt = [
      'Classify the GitHub issue below into exactly ONE Shep contributor lane.',
      `Allowed lanes: ${allowed}.`,
      'Respond with JSON: { "lane": "<lane>", "rationale": "<one short sentence>" }.',
      'Use lowercase lane values that match the allowed list verbatim.',
      '',
      `Title: ${input.title}`,
      `Body: ${input.body}`,
      input.existingLabels?.length ? `Labels: ${input.existingLabels.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const result = await executor.execute(prompt, {
      outputSchema: {
        type: 'object',
        properties: {
          lane: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['lane'],
      },
    });

    const parsed = parseAgentResponse(result.result);
    return {
      lane: parsed.lane,
      source: 'agent',
      rationale: parsed.rationale ?? 'Classified via contributor-onboarding agent.',
    };
  }
}

function applyRules(input: ClassifyIntoLaneInput): RuleMatch | null {
  for (const [pattern, lane] of TITLE_PREFIX_LANES) {
    if (pattern.test(input.title)) {
      return { lane, rationale: `Title prefix matched ${lane} lane.` };
    }
  }

  const labelHits = new Set<ContributorLane>();
  for (const raw of input.existingLabels ?? []) {
    const lane = LABEL_LANE_HINTS[raw.toLowerCase()];
    if (lane) labelHits.add(lane);
  }
  if (labelHits.size === 1) {
    const [lane] = labelHits;
    return { lane, rationale: `Single matching label routed to ${lane}.` };
  }

  const bodyHits = new Set<ContributorLane>();
  for (const [pattern, lane] of BODY_KEYWORD_LANES) {
    if (pattern.test(input.body)) bodyHits.add(lane);
  }
  if (bodyHits.size === 1) {
    const [lane] = bodyHits;
    return { lane, rationale: `Body keyword routed to ${lane}.` };
  }

  return null;
}

function parseAgentResponse(raw: string): { lane: ContributorLane; rationale?: string } {
  const candidate = JSON.parse(raw) as { lane?: unknown; rationale?: unknown };
  const laneValue = String(candidate.lane ?? '').toLowerCase();
  const allowed = new Set<string>(Object.values(ContributorLane));
  if (!allowed.has(laneValue)) {
    throw new Error(`Agent returned invalid lane: ${JSON.stringify(candidate.lane)}`);
  }
  return {
    lane: laneValue as ContributorLane,
    rationale: typeof candidate.rationale === 'string' ? candidate.rationale : undefined,
  };
}
