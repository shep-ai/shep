/**
 * Post Chat Block Use Case (spec 137)
 *
 * An agent posts a rich block — a spec to review, an HTML preview, a plan card
 * — into a chat conversation. The block is validated by the domain codec and
 * stored as an assistant message, so it takes its place in the timeline and
 * survives restarts. Every agent reaches this through `shep chat block` or the
 * `post_chat_block` MCP tool; both are thin adapters over this use case.
 *
 * The row is written straight to the message repository rather than through
 * the session service: the caller usually runs in another process (the
 * agent's shell, an MCP server). Open chat streams pick it up through
 * ListChatMessagesSinceUseCase.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import type { IInteractiveMessageRepository } from '../../ports/output/repositories/interactive-message-repository.interface.js';
import {
  InteractiveMessageRole,
  type ChatBlock,
  type InteractiveMessage,
} from '../../../domain/generated/output.js';
import {
  chatBlockFromInput,
  formatChatBlockMessage,
  type ChatBlockInput,
} from '../../../domain/shared/chat-block.js';
import { isChatScopeKey } from '../../../domain/shared/chat-scope.js';
import { InvalidChatBlockError } from '../../../domain/errors/invalid-chat-block.error.js';

export interface PostChatBlockInput extends ChatBlockInput {
  /** Conversation scope key (`global`, `repo-<id>`, `app-<id>`, or a feature id). */
  scope: string;
}

export interface PostChatBlockResult {
  block: ChatBlock;
  message: InteractiveMessage;
}

@injectable()
export class PostChatBlockUseCase {
  constructor(
    @inject('IInteractiveMessageRepository')
    private readonly messages: IInteractiveMessageRepository
  ) {}

  async execute(input: PostChatBlockInput): Promise<PostChatBlockResult> {
    const { scope, ...blockInput } = input;
    if (!isChatScopeKey(scope)) {
      throw new InvalidChatBlockError(`"${scope}" is not a chat conversation.`);
    }
    const block = chatBlockFromInput(randomUUID(), blockInput);
    const now = new Date();
    const message: InteractiveMessage = {
      id: randomUUID(),
      featureId: scope,
      role: InteractiveMessageRole.assistant,
      content: formatChatBlockMessage(block),
      createdAt: now,
      updatedAt: now,
    };
    await this.messages.create(message);
    return { block, message };
  }
}
