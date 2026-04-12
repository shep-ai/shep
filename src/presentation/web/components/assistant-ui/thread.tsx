'use client';

import type { FC } from 'react';
import { createPortal } from 'react-dom';
import {
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from '@assistant-ui/react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ToolBubble, parseToolEvent } from '@/components/features/chat/tool-bubble';
import {
  SendHorizontal,
  CircleStop,
  Copy,
  Paperclip,
  Bot,
  User,
  Maximize2,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
} from 'lucide-react';

// ── Markdown components for assistant messages ──────────────────────────────

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} text-[11px]`}>{children}</code>
    ) : (
      <code className="bg-background/50 rounded-md px-1.5 py-0.5 font-mono text-xs">
        {children}
      </code>
    ),
  pre: ({ children }) => {
    // Extract language and raw text from the nested <code> element
    const codeEl = children as React.ReactElement<{ className?: string; children?: string }>;
    const lang = codeEl?.props?.className?.replace('language-', '') ?? '';
    const rawText = typeof codeEl?.props?.children === 'string' ? codeEl.props.children : '';
    const isPreviewable = ['html', 'svg'].includes(lang) && rawText.length > 0;

    if (isPreviewable) {
      return <HtmlPreviewBlock code={rawText} language={lang} />;
    }

    return <CollapsibleCode language={lang}>{children}</CollapsibleCode>;
  },
  ul: ({ children }) => <ul className="mb-2 list-disc ps-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal ps-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1 text-base font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 text-sm font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
  a: ({ children, href }) => (
    <a href={href} className="text-blue-500 underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-muted-foreground/30 my-1 border-s-2 ps-3 italic opacity-80">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50 border-b">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1 text-start font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-muted border-t px-2 py-1">{children}</td>,
  tr: ({ children }) => <tr>{children}</tr>,
  hr: () => <hr className="border-border/40 my-3 border-t" />,
};

// ── Thread ──────────────────────────────────────────────────────────────────

export function Thread({
  className,
  beforeMessages,
  afterMessages,
  composer,
  hideEmpty,
}: {
  className?: string;
  /** Content rendered inside the scrollable viewport, BEFORE messages. Used by the application chat to pin the step tracker at the top of the scroll area. */
  beforeMessages?: React.ReactNode;
  /** Content rendered inside the scrollable viewport, after messages (e.g. interaction bubbles). */
  afterMessages?: React.ReactNode;
  composer?: React.ReactNode;
  /** Suppress the default "empty chat" placeholder — useful when `beforeMessages` already fills the viewport (e.g. a step tracker). */
  hideEmpty?: boolean;
}) {
  return (
    <ThreadPrimitive.Root className={cn('flex h-full flex-col', className)}>
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto pt-4">
        {hideEmpty ? null : (
          <ThreadPrimitive.Empty>
            <ThreadEmpty />
          </ThreadPrimitive.Empty>
        )}

        {beforeMessages}

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        {afterMessages}
      </ThreadPrimitive.Viewport>

      {composer ?? <Composer />}
    </ThreadPrimitive.Root>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

function ThreadEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <Bot className="text-muted-foreground/40 h-10 w-10" />
      <p className="text-muted-foreground text-sm">
        Send a message to start chatting with the agent.
      </p>
    </div>
  );
}

// ── User message ────────────────────────────────────────────────────────────

const INTERACTION_PREFIX = '{{interaction}}';

const UserMessage: FC = () => {
  const message = useMessage();

  // Check if this is an interaction response message
  const firstPart = message?.content?.[0];
  const text = firstPart && 'text' in firstPart ? firstPart.text : '';
  if (text.startsWith(INTERACTION_PREFIX)) {
    return <InteractionResponseMessage text={text} />;
  }

  return (
    <MessagePrimitive.Root className="group animate-in fade-in-0 slide-in-from-bottom-1 flex w-full items-start gap-2.5 px-4 py-0.5 duration-300 ease-out">
      {/* User avatar */}
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
        <User className="h-3.5 w-3.5 text-violet-500" />
      </div>

      <div className="flex max-w-[85%] min-w-0 flex-col gap-0.5">
        <div className="text-foreground mt-px overflow-hidden rounded-2xl rounded-tl-sm border border-violet-500/15 bg-violet-500/8 px-4 py-2 text-sm leading-relaxed break-words shadow-sm backdrop-blur-md dark:bg-violet-500/15">
          <MessagePrimitive.Content components={{ Text: UserMessageText }} />
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MessageMeta />
          <ActionBarPrimitive.Root className="flex items-center gap-1">
            <ActionBarPrimitive.Copy asChild>
              <IconButton tooltip="Copy">
                <Copy />
              </IconButton>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

/** Compact green bubble showing the user's selections from an AskUserQuestion interaction. */
function InteractionResponseMessage({ text }: { text: string }) {
  const parsed = useMemo(() => {
    try {
      const json = text.slice(INTERACTION_PREFIX.length);
      return JSON.parse(json) as {
        questions: { header: string; question: string }[];
        answers: Record<string, string>;
      };
    } catch {
      return null;
    }
  }, [text]);

  if (!parsed) return null;

  return (
    <MessagePrimitive.Root className="group animate-in fade-in-0 slide-in-from-bottom-1 flex w-full items-start gap-2.5 px-4 py-0.5 duration-300 ease-out">
      <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-foreground mt-px flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl rounded-tl-sm border border-emerald-600/20 bg-emerald-50/50 px-4 py-2 text-sm shadow-sm dark:border-emerald-500/20 dark:bg-emerald-950/20">
          {parsed.questions.map((q) => (
            <span key={q.question} className="flex items-center gap-2">
              <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-700 uppercase dark:bg-emerald-900/50 dark:text-emerald-400">
                {q.header}
              </span>
              <span className="text-muted-foreground text-xs">
                {parsed.answers[q.question] || 'No answer'}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MessageMeta />
          <ActionBarPrimitive.Root className="flex items-center gap-1">
            <ActionBarPrimitive.Copy asChild>
              <IconButton tooltip="Copy">
                <Copy />
              </IconButton>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function UserMessageText({ text }: { text: string }) {
  return <span className="whitespace-pre-wrap">{text}</span>;
}

// ── Assistant message ───────────────────────────────────────────────────────

const AssistantMessage: FC = () => {
  // Peek at the raw message content to decide whether this is a
  // tool-event message (Bash / Read / Write / Edit / …). Tool events
  // render as a compact chip + expanded preview — they should NOT be
  // wrapped in the normal assistant bubble shell (that adds bulky
  // padding, avatar, background, and copy button). Everything else
  // falls through to the regular bubble.
  const message = useMessage();
  const firstPart = message?.content?.[0];
  const rawText = firstPart && 'text' in firstPart ? firstPart.text : '';
  const toolEvent = rawText ? parseToolEvent(rawText) : null;

  if (toolEvent) {
    return (
      <MessagePrimitive.Root className="group animate-in fade-in-0 slide-in-from-bottom-1 flex w-full items-start gap-2.5 px-4 py-0.5 duration-300 ease-out">
        {/* Keep the avatar slot for visual rhythm but use a smaller inline icon */}
        <div className="text-muted-foreground/40 mt-1 flex h-6 w-6 shrink-0 items-center justify-center">
          <Bot className="h-3 w-3" />
        </div>
        <div className="flex min-w-0 flex-1 items-center py-0.5">
          <ToolBubble text={rawText} />
        </div>
      </MessagePrimitive.Root>
    );
  }

  return (
    <MessagePrimitive.Root className="group animate-in fade-in-0 slide-in-from-bottom-1 flex w-full items-start gap-2.5 px-4 py-0.5 duration-300 ease-out">
      {/* Avatar */}
      <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
        <Bot className="text-muted-foreground h-3.5 w-3.5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="bg-muted/50 text-foreground mt-px overflow-hidden rounded-2xl rounded-tl-sm border border-white/5 px-4 py-2 text-sm leading-relaxed break-words shadow-sm backdrop-blur-md dark:bg-neutral-800/60">
          <MessagePrimitive.Content components={{ Text: AssistantMessageText }} />
        </div>

        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <MessageMeta />
          <ActionBarPrimitive.Root className="flex items-center gap-1">
            <ActionBarPrimitive.Copy asChild>
              <IconButton tooltip="Copy">
                <Copy />
              </IconButton>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

// ── Collapsible code block ───────────────────────────────────────────────

const CODE_COLLAPSED_HEIGHT = 200; // px

function CollapsibleCode({ children, language }: { children: React.ReactNode; language?: string }) {
  const { t } = useTranslation('web');
  const [expanded, setExpanded] = useState(false);
  const [needsCollapse, setNeedsCollapse] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.scrollHeight > CODE_COLLAPSED_HEIGHT + 40) {
      setNeedsCollapse(true);
    }
  }, [children]);

  return (
    <div className="bg-background/50 relative my-2 overflow-hidden rounded-md">
      {language ? (
        <div className="text-muted-foreground/50 border-b border-white/5 px-3 py-1 font-mono text-[10px] uppercase">
          {language}
        </div>
      ) : null}
      <pre
        ref={ref}
        className="overflow-x-auto p-3 font-mono text-xs leading-relaxed transition-[max-height] duration-300 ease-in-out"
        style={{
          maxHeight: expanded
            ? 'min(60vh, 500px)'
            : !needsCollapse
              ? 'min(60vh, 500px)'
              : `${CODE_COLLAPSED_HEIGHT}px`,
          overflow: expanded ? 'auto' : undefined,
        }}
      >
        {children}
      </pre>
      {needsCollapse && !expanded ? (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-black/30 to-transparent pt-12 pb-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/80 shadow-lg backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
          >
            <ChevronDown className="h-3 w-3" />
            {t('chat.showMore')}
          </button>
        </div>
      ) : null}
      {needsCollapse && expanded ? (
        <div className="flex justify-center border-t border-white/5 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] text-white/50 transition-colors hover:text-white/80"
          >
            <ChevronUp className="h-3 w-3" />
            {t('chat.showLess')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── HTML preview block with code/preview toggle ─────────────────────────

function HtmlPreviewBlock({ code, language }: { code: string; language: string }) {
  const { t } = useTranslation('web');
  const [showPreview, setShowPreview] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [fullscreenCode, setFullscreenCode] = useState(false);
  const lines = code.split('\n').length;
  const chars = code.length;

  return (
    <>
      <div className="bg-background/50 my-2 overflow-hidden rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-1">
          <span className="text-muted-foreground font-mono text-xs uppercase">{language}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className={cn(
                'rounded px-2.5 py-0.5 text-xs font-medium transition-colors',
                !showPreview
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('chat.code')}
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className={cn(
                'rounded px-2.5 py-0.5 text-xs font-medium transition-colors',
                showPreview
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('chat.preview')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFullscreenCode(!showPreview);
                setMaximized(true);
              }}
              className="text-muted-foreground hover:text-foreground ms-1 rounded p-0.5 transition-colors"
              title={t('chat.openFullscreen')}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div style={{ height: 'min(55vh, 450px)' }}>
          {showPreview ? (
            <iframe
              srcDoc={code}
              sandbox="allow-scripts"
              className="h-full w-full border-0 bg-white"
              title={t('chat.htmlPreview')}
            />
          ) : (
            <pre className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed">
              <code>{code}</code>
            </pre>
          )}
        </div>
      </div>

      {/* Fullscreen modal — fake browser chrome, portaled to body */}
      {maximized && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setMaximized(false)}
            >
              <div
                className="bg-background relative flex h-[95vh] w-[95vw] flex-col overflow-hidden rounded-xl border shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Toolbar */}
                <div className="bg-muted/80 flex h-12 shrink-0 items-center justify-between border-b px-5">
                  {/* Left — tabs */}
                  <div className="bg-muted flex items-center gap-0.5 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setFullscreenCode(false)}
                      className={cn(
                        'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                        !fullscreenCode
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t('chat.preview')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFullscreenCode(true)}
                      className={cn(
                        'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                        fullscreenCode
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {t('chat.code')}
                    </button>
                  </div>

                  {/* Center — stats */}
                  <div className="text-muted-foreground/60 flex items-center gap-4 text-xs">
                    <span>{lines} lines</span>
                    <span>{chars.toLocaleString()} chars</span>
                    <span className="font-mono uppercase">{language}</span>
                  </div>

                  {/* Right — close */}
                  <button
                    type="button"
                    onClick={() => setMaximized(false)}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {/* Content */}
                {fullscreenCode ? (
                  <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                    <code>{code}</code>
                  </pre>
                ) : (
                  <iframe
                    srcDoc={code}
                    sandbox="allow-scripts"
                    className="flex-1 border-0 bg-white dark:bg-neutral-900"
                    title={t('chat.htmlPreviewFullscreen')}
                  />
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const ACTIVITY_MARKER_RE = /^\*⏳ (.+)\*$/;

function AssistantMessageText({ text }: { text: string }) {
  if (text === '*Thinking...*' || text === '*Agent is waking up...*') {
    return <ThinkingIndicator booting={text.includes('waking')} />;
  }

  // Live activity indicator (e.g. "Using tool: Bash", "Running: Read")
  const activityMatch = ACTIVITY_MARKER_RE.exec(text);
  if (activityMatch) {
    return <ActivityIndicator label={activityMatch[1]} />;
  }

  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </Markdown>
  );
}

function ActivityIndicator({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm italic">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

// ── Thinking indicator with cycling words ────────────────────────────────

const THINKING_WORDS = [
  'Thinking',
  'Reasoning',
  'Analyzing',
  'Processing',
  'Evaluating',
  'Considering',
  'Reflecting',
  'Pondering',
];

const BOOTING_WORDS = ['Waking up', 'Initializing', 'Loading tools', 'Preparing', 'Connecting'];

import { useEffect, useRef, useState } from 'react';

function ThinkingIndicator({ booting }: { booting: boolean }) {
  const words = booting ? BOOTING_WORDS : THINKING_WORDS;
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setFade(true);
      }, 200);
    }, 2000);
    return () => clearInterval(interval);
  }, [words]);

  return (
    <span className="text-muted-foreground inline-flex w-32 items-center gap-1.5 text-sm italic">
      <span
        className="inline-block transition-all duration-300 ease-in-out"
        style={{ opacity: fade ? 1 : 0, transform: fade ? 'translateY(0)' : 'translateY(-4px)' }}
      >
        {words[index]}
      </span>
      <span className="inline-flex gap-0.5">
        <span
          className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="bg-muted-foreground/60 h-1 w-1 animate-bounce rounded-full"
          style={{ animationDelay: '300ms' }}
        />
      </span>
    </span>
  );
}

// ── Message metadata (timestamp + relative time) ────────────────────────────

function MessageMeta() {
  const message = useMessage();
  // Tick every 30s so relative timestamps stay fresh
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const meta = useMemo(() => {
    if (!message?.createdAt) return null;
    const date = new Date(message.createdAt as unknown as string);
    if (isNaN(date.getTime())) return null;
    return {
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      relative: formatRelativeTime(date),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.createdAt, tick]);

  if (!meta) return null;

  return (
    <span className="text-muted-foreground/60 text-[10px]" title={meta.time}>
      {meta.relative}
    </span>
  );
}

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 0 || diff < 5000) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

// ── Icon button helper ──────────────────────────────────────────────────────

import { forwardRef, useMemo } from 'react';
import type { ButtonHTMLAttributes } from 'react';

const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tooltip: string }
>(({ tooltip, children, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    title={tooltip}
    className={cn(
      'text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors',
      '[&>svg]:h-3.5 [&>svg]:w-3.5',
      className
    )}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';

// ── Composer ────────────────────────────────────────────────────────────────

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t p-3">
      <ComposerPrimitive.AddAttachment asChild>
        <IconButton tooltip="Attach file" className="mb-0.5">
          <Paperclip />
        </IconButton>
      </ComposerPrimitive.AddAttachment>

      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Write a message..."
        className={cn(
          'bg-muted min-h-[40px] flex-1 resize-none rounded-xl border-0 px-4 py-2.5 text-sm',
          'focus:ring-ring/30 focus:ring-2 focus:outline-none',
          'placeholder:text-muted-foreground/60',
          'max-h-40 overflow-y-auto'
        )}
      />
      <ComposerAction />
    </ComposerPrimitive.Root>
  );
}

function ComposerAction() {
  return (
    <>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send
          className={cn(
            'bg-primary text-primary-foreground inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl',
            'hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30',
            'transition-colors'
          )}
        >
          <SendHorizontal className="size-4" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel
          className={cn(
            'bg-destructive/10 text-destructive inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-xl',
            'hover:bg-destructive/20',
            'transition-colors'
          )}
        >
          <CircleStop className="size-4" />
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </>
  );
}
