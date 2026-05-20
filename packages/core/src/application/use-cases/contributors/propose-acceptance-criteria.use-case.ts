/**
 * ProposeAcceptanceCriteriaUseCase — spec 097, FR-27.
 *
 * Given an issue body, returns a markdown checklist of acceptance criteria
 * suitable for posting back into the issue or for use as the brief for a
 * `/shep-kit:new-feature` invocation. Reusable from `groom-issue` and from
 * manual CLI calls.
 *
 * Determinism: the executor is invoked with `temperature: 0` (when the
 * adapter respects that hint) and a stable system prompt; combined with
 * the structured output schema this gives the use case the idempotent
 * behavior the acceptance criteria require.
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

const SYSTEM_PROMPT = [
  'You write acceptance criteria for open-source contributor issues.',
  'Each criterion is a single GitHub markdown checkbox (`- [ ] ...`).',
  'Criteria are independently verifiable, observable from the outside,',
  'and avoid implementation details. Return between 2 and 6 criteria.',
].join(' ');

const MIN_CRITERIA = 2;

/**
 * Issue text used by the agent to generate acceptance criteria.
 */
export interface ProposeAcceptanceCriteriaInput {
  /** Issue body — natural language; agent grounds criteria on this only. */
  body: string;
  /** Optional issue title to anchor the criteria semantically. */
  title?: string;
}

/**
 * Normalized acceptance criteria returned as both a list and markdown block.
 */
export interface ProposeAcceptanceCriteriaResult {
  /** Markdown checklist (joined with newlines) ready to paste into an issue. */
  markdown: string;
  /** Individual criterion lines (each starts with `- [ ] `). */
  criteria: readonly string[];
}

@injectable()
export class ProposeAcceptanceCriteriaUseCase {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: ProposeAcceptanceCriteriaInput): Promise<ProposeAcceptanceCriteriaResult> {
    const executor = await this.agentProvider.getExecutor();
    const prompt = renderPrompt(input);

    const result = await executor.execute(prompt, {
      systemPrompt: SYSTEM_PROMPT,
      outputSchema: {
        type: 'object',
        properties: {
          criteria: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['criteria'],
      },
    });

    const criteria = parseCriteria(result.result);
    return { criteria, markdown: criteria.join('\n') };
  }
}

function renderPrompt(input: ProposeAcceptanceCriteriaInput): string {
  return [
    'Write acceptance criteria for the GitHub issue below.',
    'Return JSON: { "criteria": ["- [ ] ...", "- [ ] ..."] }.',
    '',
    input.title ? `Title: ${input.title}` : '',
    `Body: ${input.body}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function parseCriteria(raw: string): readonly string[] {
  const parsed = JSON.parse(raw) as { criteria?: unknown };
  if (!Array.isArray(parsed.criteria)) {
    throw new Error('Agent did not return a "criteria" array.');
  }
  const criteria = parsed.criteria
    .filter((c): c is string => typeof c === 'string')
    .map(normalizeCriterion);
  if (criteria.length < MIN_CRITERIA) {
    throw new Error(
      `Agent returned too few criteria (got ${criteria.length}, need at least ${MIN_CRITERIA}).`
    );
  }
  return criteria;
}

function normalizeCriterion(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('- [ ]')) return trimmed;
  if (trimmed.startsWith('- ')) return `- [ ] ${trimmed.slice(2)}`;
  return `- [ ] ${trimmed}`;
}
