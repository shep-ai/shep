/**
 * SessionAdoptionSummarizer
 *
 * Derives feature metadata from an existing agent CLI conversation, so a
 * session started outside shep can become a tracked feature.
 *
 * Follows the MetadataGenerator precedent deliberately: a module-level JSON
 * schema constant, a typed result interface, prompt truncation before the call,
 * and IStructuredAgentCaller as the only model boundary. Any failure falls back
 * to deterministic extraction, so adoption degrades in quality but never in
 * availability.
 *
 * Security: transcripts routinely contain secrets and customer data. The prompt
 * is truncated, and only derived summaries are returned — raw transcript text is
 * never passed through to be persisted.
 */

import { injectable, inject } from 'tsyringe';
import type { AgentSession, AgentSessionMessage } from '../../../domain/generated/output.js';
import type { IStructuredAgentCaller } from '../../ports/output/agents/structured-agent-caller.interface.js';

/** Maximum characters of transcript sent to the model. */
const MAX_TRANSCRIPT_CHARS = 6000;

/** Maximum characters of any single message included in the prompt. */
const MAX_MESSAGE_CHARS = 800;

/** Characters of the first user message used when falling back. */
const FALLBACK_DESCRIPTION_CHARS = 300;

/** Words kept when slugifying a fallback name. */
const FALLBACK_SLUG_WORDS = 4;

const ADOPTION_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string', description: 'kebab-case identifier, 2-4 words' },
    name: { type: 'string', description: 'polished, professional feature title' },
    description: {
      type: 'string',
      description: 'what this conversation was working on, 1-2 sentences',
    },
    remainingWork: {
      type: 'string',
      description: 'what still appears unfinished, 1-3 sentences',
    },
  },
  required: ['slug', 'name', 'description', 'remainingWork'],
  additionalProperties: false,
} as const;

export interface SessionAdoptionSummary {
  slug: string;
  name: string;
  description: string;
  remainingWork: string;
  /** True when the model call failed and deterministic extraction was used */
  derivedLocally: boolean;
}

@injectable()
export class SessionAdoptionSummarizer {
  constructor(
    @inject('IStructuredAgentCaller')
    private readonly structuredCaller: IStructuredAgentCaller
  ) {}

  async summarize(session: AgentSession): Promise<SessionAdoptionSummary> {
    const transcript = this.renderTranscript(session.messages ?? []);

    try {
      const parsed = await this.structuredCaller.call<
        Omit<SessionAdoptionSummary, 'derivedLocally'>
      >(this.buildPrompt(session, transcript), ADOPTION_SCHEMA, {
        maxTurns: 10,
        allowedTools: [],
        silent: true,
      });

      if (parsed.slug && parsed.name && parsed.description) {
        return {
          slug: this.toSlug(parsed.slug),
          name: parsed.name,
          description: parsed.description,
          remainingWork: parsed.remainingWork ?? '',
          derivedLocally: false,
        };
      }
    } catch {
      // Structured call failed (StructuredCallError or transport) — fall
      // through to deterministic extraction rather than failing adoption.
    }

    return this.extractLocally(session);
  }

  private buildPrompt(session: AgentSession, transcript: string): string {
    return `You are adopting an existing AI coding session into a project tracker.

Analyze the conversation below and summarise the work it represents.

Session metadata:
- Agent: ${session.agentType}
- Project: ${session.projectPath}
- Messages: ${session.messageCount}

Conversation (may be truncated):
"""
${transcript}
"""

Return a JSON object with these fields:
- slug: kebab-case identifier, 2-4 words MAX, naming the work
- name: polished, professional title for the work
- description: 1-2 sentences on what this conversation was accomplishing
- remainingWork: 1-3 sentences on what still looks unfinished. If everything
  appears complete, say so explicitly.

Do NOT copy secrets, tokens, or credentials from the conversation into any field.`;
  }

  /** Render messages into a bounded plain-text transcript. */
  private renderTranscript(messages: AgentSessionMessage[]): string {
    const rendered: string[] = [];
    let total = 0;

    for (const message of messages) {
      const content =
        message.content.length > MAX_MESSAGE_CHARS
          ? `${message.content.slice(0, MAX_MESSAGE_CHARS)}…`
          : message.content;
      const line = `${message.role}: ${content}`;

      if (total + line.length > MAX_TRANSCRIPT_CHARS) {
        rendered.push('… (transcript truncated)');
        break;
      }

      rendered.push(line);
      total += line.length;
    }

    return rendered.join('\n\n');
  }

  /**
   * Deterministic fallback: the first user message describes the work, and its
   * opening words name it. Lower quality than summarisation, but always
   * available.
   */
  private extractLocally(session: AgentSession): SessionAdoptionSummary {
    const firstUserMessage = (session.messages ?? []).find((m) => m.role === 'user')?.content;
    const seed = (firstUserMessage ?? session.preview ?? '').trim();

    const description =
      seed === ''
        ? `Adopted ${session.agentType} session ${session.id} with ${session.messageCount} messages.`
        : seed.slice(0, FALLBACK_DESCRIPTION_CHARS);

    const name = seed === '' ? `Adopted session ${session.id.slice(0, 8)}` : this.toTitle(seed);

    return {
      slug: this.toSlug(name),
      name,
      description,
      remainingWork:
        'Remaining work was not summarised automatically — review the original conversation.',
      derivedLocally: true,
    };
  }

  /** First few words of the text, capitalised, as a human-readable title. */
  private toTitle(text: string): string {
    const words = text
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter((w) => w !== '')
      .slice(0, FALLBACK_SLUG_WORDS);

    if (words.length === 0) return 'Adopted session';

    const joined = words.join(' ');
    return joined.charAt(0).toUpperCase() + joined.slice(1);
  }

  private toSlug(text: string): string {
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .filter((part) => part !== '')
      .slice(0, FALLBACK_SLUG_WORDS)
      .join('-');

    return slug === '' ? 'adopted-session' : slug;
  }
}
