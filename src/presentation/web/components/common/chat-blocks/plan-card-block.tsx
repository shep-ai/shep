'use client';

import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ChatBlockActions,
  ChatBlockMarkdown,
  ChatBlockShell,
  type ChatBlockViewProps,
} from './chat-block-parts';

/** A plan the user implements as proposed or asks to refine (T3's plan pattern, spec 137). */
export function PlanCardBlock({ block, response, onRespond, className }: ChatBlockViewProps) {
  const { t } = useTranslation('web');
  return (
    <ChatBlockShell
      icon={<ListChecks className="size-4 text-violet-600 dark:text-violet-400" />}
      kind={t('chatBlocks.kinds.plan_card')}
      title={block.title}
      className={className}
      footer={<ChatBlockActions block={block} response={response} onRespond={onRespond} />}
    >
      <ChatBlockMarkdown markdown={block.markdown ?? ''} />
    </ChatBlockShell>
  );
}
