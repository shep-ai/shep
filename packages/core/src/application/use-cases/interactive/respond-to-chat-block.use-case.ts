/**
 * Respond To Chat Block Use Case (spec 137)
 *
 * The user answers a block: approves a spec or requests changes, implements a
 * plan or asks to refine it. The answer is stored as a `{{block-response}}`
 * user message (so the block shows as answered after a reload) and the agent
 * is sent a plain sentence describing it. That is T3 Code's `message` response
 * capability: it survives restarts and every provider can read it.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import type { IInteractiveMessageRepository } from '../../ports/output/repositories/interactive-message-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';
import {
  InteractiveMessageRole,
  type ChatBlockAction,
  type ChatBlockResponse,
  type InteractiveMessage,
} from '../../../domain/generated/output.js';
import {
  chatBlockResponseFromInput,
  chatBlockResponseSentence,
  findChatBlock,
  formatChatBlockResponseMessage,
  resolveChatBlockResponses,
} from '../../../domain/shared/chat-block.js';
import { ChatBlockNotFoundError } from '../../../domain/errors/chat-block-not-found.error.js';
import { ChatBlockAlreadyAnsweredError } from '../../../domain/errors/chat-block-already-answered.error.js';

/** How far back a conversation is read to find the block being answered. */
const CONVERSATION_READ_LIMIT = 10_000;

export interface RespondToChatBlockInput {
  scope: string;
  blockId: string;
  action: ChatBlockAction;
  note?: string;
  /** Directory the agent works in, used if answering has to boot its session. */
  worktreePath: string;
}

export interface RespondToChatBlockResult {
  response: ChatBlockResponse;
  message: InteractiveMessage;
}

@injectable()
export class RespondToChatBlockUseCase {
  constructor(
    @inject('IInteractiveMessageRepository')
    private readonly messages: IInteractiveMessageRepository,
    @inject('IInteractiveSessionService')
    private readonly sessions: IInteractiveSessionService
  ) {}

  async execute(input: RespondToChatBlockInput): Promise<RespondToChatBlockResult> {
    const conversation = await this.messages.findByFeatureId(input.scope, CONVERSATION_READ_LIMIT);
    const block = findChatBlock(conversation, input.blockId);
    if (!block) throw new ChatBlockNotFoundError(input.scope, input.blockId);
    if (resolveChatBlockResponses(conversation).has(block.id)) {
      throw new ChatBlockAlreadyAnsweredError(block.id);
    }
    const response = chatBlockResponseFromInput(block, input.action, input.note);

    // Dated before the agent is told, so the answer sorts ahead of its reply.
    const now = new Date();
    const message: InteractiveMessage = {
      id: randomUUID(),
      featureId: input.scope,
      role: InteractiveMessageRole.user,
      content: formatChatBlockResponseMessage(response),
      createdAt: now,
      updatedAt: now,
    };

    // Tell the agent first: if it cannot be told (no interactive mode, too many
    // sessions) nothing is stored and the block stays open to answer again. The
    // agent reads a sentence; the timeline keeps only the response row.
    const persistUserMessage = false;
    await this.sessions.sendUserMessage(
      input.scope,
      chatBlockResponseSentence(block, response),
      input.worktreePath,
      undefined,
      undefined,
      undefined,
      undefined,
      persistUserMessage
    );
    await this.messages.create(message);
    return { response, message };
  }
}
