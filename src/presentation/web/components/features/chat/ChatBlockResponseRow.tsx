'use client';

import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseChatBlockResponseMessage } from '@shepai/core/domain/shared/chat-block';
import { cn } from '@/lib/utils';
import { useChatBlocks } from './chat-blocks-context';

export interface ChatBlockResponseRowProps {
  /** Raw content of a `{{block-response}}` message. */
  content: string;
  className?: string;
}

/** The user's answer to a block, as one line in the timeline (spec 137). */
export function ChatBlockResponseRow({ content, className }: ChatBlockResponseRowProps) {
  const { t } = useTranslation('web');
  const chat = useChatBlocks();
  const response = parseChatBlockResponseMessage(content);
  if (!response) return null;
  const title = chat?.blocks.get(response.blockId)?.title;

  return (
    <p
      data-testid="chat-block-response-row"
      className={cn('flex items-start gap-1.5 py-1 text-xs', className)}
    >
      <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className="min-w-0">
        <span className="font-medium">{t(`chatBlocks.resolved.${response.action}`)}</span>
        {title ? <span className="text-foreground/80"> · {title}</span> : null}
        {response.note ? <span className="text-muted-foreground"> — {response.note}</span> : null}
      </span>
    </p>
  );
}
