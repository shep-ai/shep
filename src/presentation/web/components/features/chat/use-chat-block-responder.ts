'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { ChatBlockAction } from '@shepai/core/domain/generated/output';
import { chatQueryKey } from './chat-state-query';

export type RespondToChatBlock = (
  blockId: string,
  action: ChatBlockAction,
  note?: string
) => Promise<void>;

/**
 * Answers chat blocks in one conversation (spec 137). On success the chat
 * state is refetched so the stored answer appears; on failure the user is
 * told, offered a retry, and the promise rejects so the block stays open.
 */
export function useChatBlockResponder(scope: string, worktreePath?: string): RespondToChatBlock {
  const { t } = useTranslation('web');
  const queryClient = useQueryClient();
  const respondRef = useRef<RespondToChatBlock | null>(null);

  const respond = useCallback<RespondToChatBlock>(
    async (blockId, action, note) => {
      try {
        const res = await fetch(
          `/api/interactive/chat/${encodeURIComponent(scope)}/blocks/${encodeURIComponent(blockId)}/respond`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action,
              ...(note ? { note } : {}),
              ...(worktreePath ? { worktreePath } : {}),
            }),
          }
        );
        if (!res.ok) throw new Error(String(res.status));
      } catch (error) {
        toast.error(t('chatBlocks.answerFailed'), {
          description: t('chatBlocks.answerFailedDescription'),
          action: {
            label: t('chatBlocks.retry'),
            onClick: () => void respondRef.current?.(blockId, action, note).catch(() => undefined),
          },
        });
        throw error;
      }
      void queryClient.invalidateQueries({ queryKey: chatQueryKey(scope) });
    },
    [queryClient, scope, t, worktreePath]
  );
  respondRef.current = respond;
  return respond;
}
