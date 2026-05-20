/**
 * DraftOutreachPostUseCase — spec 097, FR-33.
 *
 * v1: Discord-only. Produces a draft message about a release / monthly
 * recap / milestone. Pure: returns text without sending. Posting is
 * routed through `IOutreachPublisher` and gated by
 * `IContributorActionGate` upstream.
 *
 * Reddit / HN / X drafting is deferred to a v2 spec (resolved
 * product-question 4).
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

const DISCORD_BODY_HARD_LIMIT = 2000;
const DRAFT_TARGET_LENGTH = 1800;

const SYSTEM_PROMPT = [
  'You write short Discord announcements for the Shep open-source community.',
  'Tone: friendly, factual, never marketing-spammy. Include a clear call to action.',
  'Output is plain text in Discord-flavored markdown — no front-matter, no JSON.',
  `Hard limit: ${DRAFT_TARGET_LENGTH} characters; the channel rejects anything past 2000.`,
].join(' ');

/**
 * Outreach prompt category used to frame the generated Discord draft.
 */
export type OutreachDraftKind = 'release' | 'recap' | 'milestone';

/**
 * Input facts used to draft one outbound community announcement.
 */
export interface DraftOutreachPostInput {
  /** Drives prompt framing — release vs recap vs milestone. */
  kind: OutreachDraftKind;
  /** Headline, e.g. "v0.42.0" or "April 2026 contributor recap". */
  title: string;
  /** Optional structured highlights to ground the draft. */
  highlights?: readonly string[];
  /** Optional URL the post should link to. */
  link?: string;
}

/**
 * Pure draft payload for the supported outreach channel.
 */
export interface DraftOutreachPost {
  /** Delivery channel for v1 outreach drafts; currently Discord only. */
  channel: 'discord';
  /** Discord-flavored markdown body capped below Discord's 2000-character hard limit. */
  body: string;
}

@injectable()
export class DraftOutreachPostUseCase {
  constructor(
    @inject('IAgentExecutorProvider')
    private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: DraftOutreachPostInput): Promise<DraftOutreachPost> {
    if (!input.title.trim()) {
      throw new Error('DraftOutreachPostUseCase requires a non-empty title.');
    }

    const executor = await this.agentProvider.getExecutor();
    const prompt = renderPrompt(input);

    const result = await executor.execute(prompt, { systemPrompt: SYSTEM_PROMPT });
    const body = clampToDiscordLimit(ensureContainsTitle(result.result, input.title));

    return { channel: 'discord', body };
  }
}

function renderPrompt(input: DraftOutreachPostInput): string {
  const lines = [
    `Draft a Discord announcement of kind: ${input.kind}.`,
    `Title to feature prominently: ${input.title}`,
  ];
  if (input.highlights?.length) {
    lines.push('Highlights to mention:');
    for (const h of input.highlights) lines.push(`- ${h}`);
  }
  if (input.link) lines.push(`Link to include exactly once: ${input.link}`);
  lines.push(`Keep it under ${DRAFT_TARGET_LENGTH} characters.`);
  return lines.join('\n');
}

function ensureContainsTitle(body: string, title: string): string {
  return body.includes(title) ? body : `${title}\n\n${body}`;
}

function clampToDiscordLimit(body: string): string {
  if (body.length <= DISCORD_BODY_HARD_LIMIT) return body;
  return `${body.slice(0, DISCORD_BODY_HARD_LIMIT - 1).trimEnd()}…`;
}
