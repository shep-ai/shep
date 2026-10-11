'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type {
  ChatBlock,
  ChatBlockResponse,
  InteractiveMessage,
} from '@shepai/core/domain/generated/output';
import {
  parseChatBlockMessage,
  resolveChatBlockResponses,
} from '@shepai/core/domain/shared/chat-block';
import { useChatBlockResponder, type RespondToChatBlock } from './use-chat-block-responder';

export interface ChatBlocksContextValue {
  /** Every block in the conversation, by id. */
  blocks: ReadonlyMap<string, ChatBlock>;
  /** Each answered block's answer, by block id. */
  responses: ReadonlyMap<string, ChatBlockResponse>;
  respond: RespondToChatBlock;
}

const ChatBlocksContext = createContext<ChatBlocksContextValue | null>(null);

export interface ChatBlocksProviderProps {
  scope: string;
  worktreePath?: string;
  /** The conversation's raw messages (Layer 1). */
  messages: readonly InteractiveMessage[];
  children: ReactNode;
}

/**
 * The blocks of one conversation and how to answer them (spec 137). Both chat
 * renderers read it, so a block deep in the thread or in a turn card knows
 * whether it was answered without each renderer re-deriving it.
 */
export function ChatBlocksProvider({
  scope,
  worktreePath,
  messages,
  children,
}: ChatBlocksProviderProps) {
  const respond = useChatBlockResponder(scope, worktreePath);
  const value = useMemo<ChatBlocksContextValue>(() => {
    const blocks = new Map<string, ChatBlock>();
    for (const message of messages) {
      const block = parseChatBlockMessage(message.content);
      if (block) blocks.set(block.id, block);
    }
    return { blocks, responses: resolveChatBlockResponses(messages), respond };
  }, [messages, respond]);
  return <ChatBlocksContext.Provider value={value}>{children}</ChatBlocksContext.Provider>;
}

/** The conversation's blocks, or null outside a live chat (blocks render read-only). */
export function useChatBlocks(): ChatBlocksContextValue | null {
  return useContext(ChatBlocksContext);
}
