/**
 * EditorPane
 *
 * VSCode-style editor surface for the IDE tab: a tab strip at the top
 * showing open files (with dirty indicators + close buttons) and a
 * Monaco editor below it. Monaco is dynamically imported so it stays
 * out of the initial bundle and never runs during SSR.
 */

'use client';

import { useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, FileCode, File as FileIcon, PanelRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageViewer } from './image-viewer';
import type { OpenFile } from './types';

/** Monaco is a large client-only dependency — dynamic import with ssr:false. */
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      Loading editor…
    </div>
  ),
});

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  sh: 'shell',
  bash: 'shell',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  sql: 'sql',
  xml: 'xml',
  dockerfile: 'dockerfile',
};

function languageForPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  if (base.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = base.includes('.') ? base.split('.').pop()?.toLowerCase() : '';
  return (ext ? EXTENSION_TO_LANGUAGE[ext] : undefined) ?? 'plaintext';
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

export interface EditorPaneProps {
  applicationId: string;
  openFiles: OpenFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: () => void;
  /** Promote a preview tab to a persistent tab (on tab double-click). */
  onPromote: (path: string) => void;
  /** Toggle the active file between rendered preview and Monaco source (markdown). */
  onToggleViewMode: (path: string) => void;
  /** When true, renders a "show sidebar" button at the right of the tab strip. */
  sidebarCollapsed: boolean;
  onShowSidebar: () => void;
}

export function EditorPane({
  applicationId,
  openFiles,
  activePath,
  onSelect,
  onClose,
  onChange,
  onSave,
  onPromote,
  onToggleViewMode,
  sidebarCollapsed,
  onShowSidebar,
}: EditorPaneProps) {
  const active = useMemo(
    () => openFiles.find((f) => f.path === activePath) ?? null,
    [openFiles, activePath]
  );

  // Ctrl/Cmd+S saves the active file.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!active) return;
      onChange(active.path, value ?? '');
    },
    [active, onChange]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Open files"
        className="border-border bg-muted/30 flex h-8 shrink-0 items-center border-b"
      >
        <div className="flex min-w-0 flex-1 items-center overflow-x-auto">
          {openFiles.length === 0 ? (
            <div className="text-muted-foreground px-3 text-[11px]">No file open</div>
          ) : (
            openFiles.map((f) => {
            const dirty = f.content !== f.originalContent;
            const selected = f.path === activePath;
            return (
              <div
                key={f.path}
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(f.path)}
                onDoubleClick={() => onPromote(f.path)}
                className={cn(
                  'group border-border flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-[11px]',
                  selected
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60'
                )}
                title={
                  f.isPreview
                    ? `${f.path} — preview (double-click tab or edit to keep open)`
                    : f.path
                }
              >
                <FileIcon className="h-3 w-3 shrink-0 text-sky-500" />
                <span className={cn('truncate', f.isPreview && 'italic')}>
                  {basename(f.path)}
                </span>
                {dirty ? (
                  <span
                    className="bg-primary/70 inline-block h-1.5 w-1.5 rounded-full"
                    aria-label="Unsaved changes"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(f.path);
                  }}
                  className="text-muted-foreground/70 hover:text-foreground ml-1 rounded-sm p-0.5"
                  aria-label={`Close ${f.path}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
        </div>

        {/* Right-side per-tab actions: view-mode toggle for markdown. */}
        {active?.isMarkdown ? (
          <button
            type="button"
            onClick={() => onToggleViewMode(active.path)}
            className="text-muted-foreground hover:text-foreground border-border flex h-8 w-8 shrink-0 items-center justify-center border-l"
            aria-label={
              active.viewMode === 'rendered' ? 'Show markdown source' : 'Show markdown preview'
            }
            title={
              active.viewMode === 'rendered' ? 'Show markdown source' : 'Show markdown preview'
            }
          >
            {active.viewMode === 'rendered' ? (
              <FileCode className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}

        {sidebarCollapsed ? (
          <button
            type="button"
            onClick={onShowSidebar}
            className="text-muted-foreground hover:text-foreground border-border flex h-8 w-8 shrink-0 items-center justify-center border-l"
            aria-label="Show file explorer"
            title="Show file explorer"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Editor body */}
      <div className="min-h-0 flex-1 bg-[#1e1e1e]">
        {active ? (
          active.isImage ? (
            <ImageViewer applicationId={applicationId} path={active.path} />
          ) : active.binary ? (
            <EmptyMessage>Binary file — preview not available</EmptyMessage>
          ) : active.tooLarge ? (
            <EmptyMessage>File is too large to preview</EmptyMessage>
          ) : active.isMarkdown && active.viewMode === 'rendered' ? (
            <MarkdownPreview source={active.content} />
          ) : (
            <MonacoEditor
              key={active.path}
              height="100%"
              theme="vs-dark"
              language={languageForPath(active.path)}
              value={active.content}
              onChange={handleChange}
              options={{
                fontSize: 13,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'off',
                renderWhitespace: 'selection',
                smoothScrolling: true,
              }}
            />
          )
        ) : (
          <EmptyMessage>Select a file from the tree to start editing</EmptyMessage>
        )}
      </div>
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
      {children}
    </div>
  );
}

/**
 * MarkdownPreview
 *
 * Lightweight rendered view for `.md` / `.mdx` files using `react-markdown`
 * + `remark-gfm` (tables, strikethrough, task lists). Styled against the
 * vs-dark editor backdrop so it doesn't clash when toggling source/preview.
 */
/**
 * Stable (module-scoped) `Components` map for the markdown preview so
 * react/no-unstable-nested-components is satisfied and the subtree isn't
 * thrown away on every render.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-6 border-b border-zinc-700 pb-2 text-2xl font-semibold text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-5 border-b border-zinc-800 pb-1 text-xl font-semibold text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-lg font-semibold text-white">{children}</h3>
  ),
  p: ({ children }) => <p className="my-3">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sky-400 underline hover:text-sky-300"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 ml-6 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-6 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="my-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-zinc-700 pl-4 italic text-zinc-400">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const inline = !className;
    return inline ? (
      <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[12px] text-pink-300">
        {children}
      </code>
    ) : (
      <code className={cn('font-mono text-[12px]', className)}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-3">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-6 border-zinc-800" />,
  table: ({ children }) => (
    <table className="my-4 border-collapse border border-zinc-800">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-800 bg-zinc-900 px-3 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-zinc-800 px-3 py-1">{children}</td>,
};

function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="h-full overflow-auto bg-[#1e1e1e] px-8 py-6 text-[13px] text-zinc-200">
      <div className="markdown-preview mx-auto max-w-3xl leading-6">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {source}
        </ReactMarkdown>
      </div>
    </div>
  );
}
