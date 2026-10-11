/**
 * Chat blocks and the chat-first page (spec 137): posting and answering rich
 * blocks, relaying rows written by other processes, and the conversation list.
 * Each use case is registered by class (CLI, MCP) and by string token (web).
 */

import type { DependencyContainer } from 'tsyringe';

import { PostChatBlockUseCase } from '../../../application/use-cases/interactive/post-chat-block.use-case.js';
import { RespondToChatBlockUseCase } from '../../../application/use-cases/interactive/respond-to-chat-block.use-case.js';
import { ListChatMessagesSinceUseCase } from '../../../application/use-cases/interactive/list-chat-messages-since.use-case.js';
import { ListChatConversationsUseCase } from '../../../application/use-cases/interactive/list-chat-conversations.use-case.js';

export function registerChatBlocks(container: DependencyContainer): void {
  container.registerSingleton(PostChatBlockUseCase);
  container.register('PostChatBlockUseCase', {
    useFactory: (c) => c.resolve(PostChatBlockUseCase),
  });
  container.registerSingleton(RespondToChatBlockUseCase);
  container.register('RespondToChatBlockUseCase', {
    useFactory: (c) => c.resolve(RespondToChatBlockUseCase),
  });
  container.registerSingleton(ListChatMessagesSinceUseCase);
  container.register('ListChatMessagesSinceUseCase', {
    useFactory: (c) => c.resolve(ListChatMessagesSinceUseCase),
  });
  container.registerSingleton(ListChatConversationsUseCase);
  container.register('ListChatConversationsUseCase', {
    useFactory: (c) => c.resolve(ListChatConversationsUseCase),
  });
}
