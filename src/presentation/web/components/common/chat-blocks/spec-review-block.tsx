'use client';

import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ChatBlockActions,
  ChatBlockMarkdown,
  ChatBlockShell,
  type ChatBlockViewProps,
} from './chat-block-parts';

/** A spec or PRD the user approves or sends back with changes (spec 137). */
export function SpecReviewBlock({ block, response, onRespond, className }: ChatBlockViewProps) {
  const { t } = useTranslation('web');
  return (
    <ChatBlockShell
      icon={<FileText className="size-4 text-sky-600 dark:text-sky-400" />}
      kind={t('chatBlocks.kinds.spec_review')}
      title={block.title}
      className={className}
      footer={<ChatBlockActions block={block} response={response} onRespond={onRespond} />}
    >
      <ChatBlockMarkdown markdown={block.markdown ?? ''} />
    </ChatBlockShell>
  );
}
