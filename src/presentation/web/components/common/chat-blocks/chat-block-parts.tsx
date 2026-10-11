'use client';

import { useState, type ReactNode } from 'react';
import { CircleCheck, Pencil } from 'lucide-react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import {
  ChatBlockAction,
  type ChatBlock,
  type ChatBlockResponse,
} from '@shepai/core/domain/generated/output';
import { CHAT_BLOCK_ACTIONS, CHAT_BLOCK_LIMITS } from '@shepai/core/domain/shared/chat-block';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Answers a block; a rejected promise keeps the block open for another try. */
export type ChatBlockRespond = (action: ChatBlockAction, note?: string) => Promise<void> | void;

/** Props every chat block renderer takes. */
export interface ChatBlockViewProps {
  block: ChatBlock;
  /** The user's answer, once given. */
  response?: ChatBlockResponse;
  /** Omit for a read-only block (e.g. outside a live chat). */
  onRespond?: ChatBlockRespond;
  className?: string;
}

/** Actions that ask what should change before sending. */
const NOTE_ACTIONS: ReadonlySet<ChatBlockAction> = new Set([
  ChatBlockAction.RequestChanges,
  ChatBlockAction.Refine,
]);

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-2 mb-1 text-sm font-medium first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 ps-5">{children}</ol>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="bg-muted my-2 overflow-auto rounded-md p-2 font-mono text-xs">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border px-2 py-1 text-start font-medium">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
};

/** A block's Markdown body: GitHub-flavoured, no raw HTML. */
export function ChatBlockMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="text-foreground/90 max-h-96 overflow-auto text-sm">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {markdown}
      </Markdown>
    </div>
  );
}

export interface ChatBlockShellProps {
  icon: ReactNode;
  kind: string;
  title: string;
  /** Extra controls on the right of the header. */
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** The frame every chat block shares: header with kind and title, body, footer. */
export function ChatBlockShell({
  icon,
  kind,
  title,
  toolbar,
  children,
  footer,
  className,
}: ChatBlockShellProps) {
  return (
    <section
      data-testid="chat-block"
      aria-label={`${kind}: ${title}`}
      className={cn('bg-background w-full rounded-lg border text-sm shadow-sm', className)}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="shrink-0">{icon}</span>
        <span className="text-muted-foreground shrink-0 text-xs font-medium">{kind}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {toolbar}
      </header>
      <div className="px-3 py-2">{children}</div>
      {footer ? <footer className="border-t px-3 py-2">{footer}</footer> : null}
    </section>
  );
}

/** What the user decided, shown in place of the actions. */
export function ChatBlockResolution({ response }: { response: ChatBlockResponse }) {
  const { t } = useTranslation('web');
  return (
    <p data-testid="chat-block-resolution" className="flex items-start gap-1.5 text-xs">
      <CircleCheck className="mt-px size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>
        <span className="font-medium">{t(`chatBlocks.resolved.${response.action}`)}</span>
        {response.note ? <span className="text-muted-foreground">: {response.note}</span> : null}
      </span>
    </p>
  );
}

/**
 * The block's actions (primary first). An action that needs a note opens a
 * field asking what should change; the others answer in one click.
 */
export function ChatBlockActions({
  block,
  response,
  onRespond,
}: Pick<ChatBlockViewProps, 'block' | 'response' | 'onRespond'>) {
  const { t } = useTranslation('web');
  const [noteFor, setNoteFor] = useState<ChatBlockAction | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  if (response) return <ChatBlockResolution response={response} />;
  const actions = CHAT_BLOCK_ACTIONS[block.type];
  if (!onRespond || actions.length === 0) return null;

  async function send(action: ChatBlockAction, text?: string) {
    if (!onRespond) return;
    setSending(true);
    try {
      await onRespond(action, text);
    } catch {
      // The responder reports the failure; the block stays open to retry.
    } finally {
      setSending(false);
    }
  }

  if (noteFor) {
    return (
      <div className="space-y-2">
        <Textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('chatBlocks.notePlaceholder')}
          maxLength={CHAT_BLOCK_LIMITS.noteChars}
          rows={3}
          disabled={sending}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={sending}
            onClick={() => {
              setNoteFor(null);
              setNote('');
            }}
          >
            {t('chatBlocks.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={sending || !note.trim()}
            onClick={() => void send(noteFor, note.trim())}
          >
            {t('chatBlocks.send')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {[...actions].reverse().map((action) => {
        const primary = action === actions[0];
        return (
          <Button
            key={action}
            size="sm"
            variant={primary ? 'default' : 'outline'}
            disabled={sending}
            onClick={() => (NOTE_ACTIONS.has(action) ? setNoteFor(action) : void send(action))}
          >
            {NOTE_ACTIONS.has(action) ? <Pencil className="size-3.5" /> : null}
            {t(`chatBlocks.actions.${action}`)}
          </Button>
        );
      })}
    </div>
  );
}
