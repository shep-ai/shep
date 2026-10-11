/**
 * Chat blocks (spec 137).
 *
 * An agent posts a rich block into a conversation — a spec to review, an HTML
 * preview, a plan card — and it is stored as one assistant message
 * `{{block}}<json>`. The user's answer is stored as one user message
 * `{{block-response}}<json>`. The writers (use cases) and every reader (turn
 * grouping, both chat renderers) go through these helpers, so the format and
 * the rules live in one place.
 *
 * Pure; extensionless imports (consumed by the web bundle as raw source).
 */

import {
  ChatBlockAction,
  ChatBlockType,
  type ChatBlock,
  type ChatBlockResponse,
} from '../generated/output';
import { InvalidChatBlockError } from '../errors/invalid-chat-block.error';

/** Prefix that marks a block message. */
export const CHAT_BLOCK_PREFIX = '{{block}}';

/** Prefix that marks the user's answer to a block. */
export const CHAT_BLOCK_RESPONSE_PREFIX = '{{block-response}}';

/**
 * Size caps. Chat state is fetched whole, so one oversized block would slow
 * every reload of its conversation.
 */
export const CHAT_BLOCK_LIMITS = {
  titleChars: 200,
  markdownBytes: 64 * 1024,
  htmlBytes: 256 * 1024,
  noteChars: 4000,
} as const;

/** The actions each block type takes, in display order (primary first). */
export const CHAT_BLOCK_ACTIONS: Record<ChatBlockType, readonly ChatBlockAction[]> = {
  [ChatBlockType.SpecReview]: [ChatBlockAction.Approve, ChatBlockAction.RequestChanges],
  [ChatBlockType.PlanCard]: [ChatBlockAction.Implement, ChatBlockAction.Refine],
  [ChatBlockType.HtmlPreview]: [],
};

/** Actions that only make sense with a note saying what to change. */
const ACTIONS_REQUIRING_NOTE: ReadonlySet<ChatBlockAction> = new Set([
  ChatBlockAction.RequestChanges,
  ChatBlockAction.Refine,
]);

/** Which body a block type carries. */
const BODY_FIELD: Record<ChatBlockType, 'markdown' | 'html'> = {
  [ChatBlockType.SpecReview]: 'markdown',
  [ChatBlockType.PlanCard]: 'markdown',
  [ChatBlockType.HtmlPreview]: 'html',
};

const BODY_LIMIT_BYTES: Record<'markdown' | 'html', number> = {
  markdown: CHAT_BLOCK_LIMITS.markdownBytes,
  html: CHAT_BLOCK_LIMITS.htmlBytes,
};

const BLOCK_TYPES = new Set<string>(Object.values(ChatBlockType));
const BLOCK_ACTIONS = new Set<string>(Object.values(ChatBlockAction));

export interface ChatBlockInput {
  type: ChatBlockType;
  title: string;
  markdown?: string;
  html?: string;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function isChatBlockType(value: unknown): value is ChatBlockType {
  return typeof value === 'string' && BLOCK_TYPES.has(value);
}

function isChatBlockAction(value: unknown): value is ChatBlockAction {
  return typeof value === 'string' && BLOCK_ACTIONS.has(value);
}

/** A validated block: trimmed title, the one body its type uses, within the caps. */
export function chatBlockFromInput(id: string, input: ChatBlockInput): ChatBlock {
  if (!isChatBlockType(input.type)) {
    throw new InvalidChatBlockError(
      `Unknown block type "${String(input.type)}". Use one of: ${[...BLOCK_TYPES].join(', ')}.`
    );
  }
  const title = (input.title ?? '').trim();
  if (!title) throw new InvalidChatBlockError('A block needs a title.');
  if (title.length > CHAT_BLOCK_LIMITS.titleChars) {
    throw new InvalidChatBlockError(
      `The title is longer than ${CHAT_BLOCK_LIMITS.titleChars} characters.`
    );
  }

  const field = BODY_FIELD[input.type];
  const body = input[field];
  if (typeof body !== 'string' || !body.trim()) {
    throw new InvalidChatBlockError(`A ${input.type} block needs ${field} content.`);
  }
  const limit = BODY_LIMIT_BYTES[field];
  if (byteLength(body) > limit) {
    throw new InvalidChatBlockError(`The ${field} content is larger than ${limit / 1024} KiB.`);
  }

  return { id, type: input.type, title, [field]: body };
}

export function formatChatBlockMessage(block: ChatBlock): string {
  return `${CHAT_BLOCK_PREFIX}${JSON.stringify(block)}`;
}

export function isChatBlockMessage(content: string | undefined): boolean {
  return typeof content === 'string' && content.startsWith(CHAT_BLOCK_PREFIX);
}

function parseJsonAfter(prefix: string, content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content.slice(prefix.length));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The block a message carries, or null for any other or malformed message. */
export function parseChatBlockMessage(content: string | undefined): ChatBlock | null {
  if (!content || !isChatBlockMessage(content)) return null;
  const raw = parseJsonAfter(CHAT_BLOCK_PREFIX, content);
  if (!raw) return null;
  const { id, type, title } = raw;
  if (typeof id !== 'string' || typeof title !== 'string' || !isChatBlockType(type)) return null;
  const markdown = optionalString(raw.markdown);
  const html = optionalString(raw.html);
  return {
    id,
    type,
    title,
    ...(markdown !== undefined ? { markdown } : {}),
    ...(html !== undefined ? { html } : {}),
  };
}

/** A validated answer: an action the block takes, with the note it needs. */
export function chatBlockResponseFromInput(
  block: ChatBlock,
  action: ChatBlockAction,
  note?: string
): ChatBlockResponse {
  const allowed = CHAT_BLOCK_ACTIONS[block.type];
  if (!allowed.includes(action)) {
    throw new InvalidChatBlockError(
      allowed.length
        ? `A ${block.type} block takes ${allowed.join(' or ')}, not ${String(action)}.`
        : `A ${block.type} block takes no action.`
    );
  }
  const trimmed = note?.trim() ?? '';
  if (ACTIONS_REQUIRING_NOTE.has(action) && !trimmed) {
    throw new InvalidChatBlockError(`${action} needs a note saying what to change.`);
  }
  if (trimmed.length > CHAT_BLOCK_LIMITS.noteChars) {
    throw new InvalidChatBlockError(
      `The note is longer than ${CHAT_BLOCK_LIMITS.noteChars} characters.`
    );
  }
  return { blockId: block.id, action, ...(trimmed ? { note: trimmed } : {}) };
}

export function formatChatBlockResponseMessage(response: ChatBlockResponse): string {
  return `${CHAT_BLOCK_RESPONSE_PREFIX}${JSON.stringify(response)}`;
}

export function isChatBlockResponseMessage(content: string | undefined): boolean {
  return typeof content === 'string' && content.startsWith(CHAT_BLOCK_RESPONSE_PREFIX);
}

export function parseChatBlockResponseMessage(
  content: string | undefined
): ChatBlockResponse | null {
  if (!content || !isChatBlockResponseMessage(content)) return null;
  const raw = parseJsonAfter(CHAT_BLOCK_RESPONSE_PREFIX, content);
  if (!raw) return null;
  const { blockId, action } = raw;
  if (typeof blockId !== 'string' || !isChatBlockAction(action)) return null;
  const note = optionalString(raw.note);
  return { blockId, action, ...(note !== undefined ? { note } : {}) };
}

/** What the agent reads when the user answers a block. */
const RESPONSE_SENTENCES: Record<ChatBlockAction, (title: string, note: string) => string> = {
  [ChatBlockAction.Approve]: (title) => `The user approved the spec "${title}". Continue with it.`,
  [ChatBlockAction.RequestChanges]: (title, note) =>
    `The user requested changes to the spec "${title}": ${note}\nRevise the spec and post it again for review.`,
  [ChatBlockAction.Implement]: (title) =>
    `The user chose Implement for the plan "${title}". Implement it now.`,
  [ChatBlockAction.Refine]: (title, note) =>
    `The user asked to refine the plan "${title}": ${note}\nUpdate the plan and post it again.`,
};

export function chatBlockResponseSentence(block: ChatBlock, response: ChatBlockResponse): string {
  return RESPONSE_SENTENCES[response.action](block.title, response.note ?? '');
}

interface MessageLike {
  content: string;
}

/** The block with this id in a conversation, or null. */
export function findChatBlock(messages: readonly MessageLike[], blockId: string): ChatBlock | null {
  for (const message of messages) {
    const block = parseChatBlockMessage(message.content);
    if (block?.id === blockId) return block;
  }
  return null;
}

/** Each answered block's latest response, keyed by block id. */
export function resolveChatBlockResponses(
  messages: readonly MessageLike[]
): Map<string, ChatBlockResponse> {
  const responses = new Map<string, ChatBlockResponse>();
  for (const message of messages) {
    const response = parseChatBlockResponseMessage(message.content);
    if (response) responses.set(response.blockId, response);
  }
  return responses;
}

/** Short English names of the block kinds, for titles and previews outside the web UI. */
const BLOCK_KIND_LABELS: Record<ChatBlockType, string> = {
  [ChatBlockType.SpecReview]: 'Spec review',
  [ChatBlockType.HtmlPreview]: 'Preview',
  [ChatBlockType.PlanCard]: 'Plan',
};

/** A few words for an answer, with and without the block's title. */
const RESPONSE_SUMMARIES: Record<
  ChatBlockAction,
  { titled: (title: string) => string; untitled: string }
> = {
  [ChatBlockAction.Approve]: { titled: (title) => `Approved "${title}"`, untitled: 'Approved' },
  [ChatBlockAction.RequestChanges]: {
    titled: (title) => `Requested changes to "${title}"`,
    untitled: 'Requested changes',
  },
  [ChatBlockAction.Implement]: {
    titled: (title) => `Chose Implement for "${title}"`,
    untitled: 'Chose Implement',
  },
  [ChatBlockAction.Refine]: {
    titled: (title) => `Asked to refine "${title}"`,
    untitled: 'Asked to refine',
  },
};

/** The answer in a few words (turn titles, CLI and API previews). */
export function chatBlockResponseSummary(
  response: ChatBlockResponse,
  block: ChatBlock | null
): string {
  const summary = RESPONSE_SUMMARIES[response.action];
  const head = block ? summary.titled(block.title) : summary.untitled;
  return response.note ? `${head}: ${response.note}` : head;
}

/**
 * The readable text of a chat message: a block or an answer to one is
 * described in words, anything else is returned as is.
 */
export function chatMessageDisplayText(content: string, messages: readonly MessageLike[]): string {
  const block = parseChatBlockMessage(content);
  if (block) return `${BLOCK_KIND_LABELS[block.type]}: ${block.title}`;
  const response = parseChatBlockResponseMessage(content);
  if (response)
    return chatBlockResponseSummary(response, findChatBlock(messages, response.blockId));
  return content;
}
