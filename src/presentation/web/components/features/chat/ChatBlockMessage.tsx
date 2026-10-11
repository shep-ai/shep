'use client';

import { useMemo } from 'react';
import type { ChatBlockAction } from '@shepai/core/domain/generated/output';
import { parseChatBlockMessage } from '@shepai/core/domain/shared/chat-block';
import { InlineBlockView, inlineBlockFromChatBlock } from '@/components/common/inline-blocks';
import { useChatBlocks } from './chat-blocks-context';

export interface ChatBlockMessageProps {
  /** Raw content of a `{{block}}` message. */
  content: string;
  className?: string;
}

/**
 * A block an agent posted (spec 137), rendered through the inline block
 * registry. Inside a live chat it is answerable; elsewhere it is read-only.
 */
export function ChatBlockMessage({ content, className }: ChatBlockMessageProps) {
  const chat = useChatBlocks();
  const block = useMemo(() => parseChatBlockMessage(content), [content]);
  if (!block) return null;

  const onRespond = chat
    ? (action: ChatBlockAction, note?: string) => chat.respond(block.id, action, note)
    : undefined;
  return (
    <InlineBlockView
      block={inlineBlockFromChatBlock(block, chat?.responses.get(block.id), onRespond)}
      className={className}
    />
  );
}
