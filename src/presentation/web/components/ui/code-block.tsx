'use client';

import * as React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeBlockTab {
  name: string;
  code: string;
  language?: string;
  highlightLines?: number[];
}

export type CodeBlockProps = {
  /** Programming language for syntax highlighting. */
  language: string;
  /** File name displayed in the header. */
  filename: string;
  /** Line numbers to highlight. */
  highlightLines?: number[];
  /** Lines highlighted with a green (addition) background. */
  addedLines?: number[];
  /** Lines highlighted with a red (deletion) background. */
  removedLines?: number[];
  /** Additional class name for the container. */
  className?: string;
} & ({ code: string; tabs?: never } | { code?: never; tabs: CodeBlockTab[] });

export function CodeBlock({
  language,
  filename,
  code,
  highlightLines = [],
  addedLines = [],
  removedLines = [],
  tabs = [],
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);

  const tabsExist = tabs.length > 0;

  const copyToClipboard = async () => {
    const textToCopy = tabsExist ? tabs[activeTab].code : code;
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeCode = tabsExist ? tabs[activeTab].code : code;
  const activeLanguage = tabsExist ? (tabs[activeTab].language ?? language) : language;
  const activeHighlightLines = tabsExist ? (tabs[activeTab].highlightLines ?? []) : highlightLines;

  return (
    <div
      data-testid="code-block"
      className={cn('relative w-full rounded-lg bg-slate-950 p-4 font-mono text-sm', className)}
    >
      <div className="flex flex-col gap-2">
        {tabsExist ? (
          <div className="flex overflow-x-auto">
            {tabs.map((tab, index) => (
              <button
                key={tab.name}
                type="button"
                onClick={() => setActiveTab(index)}
                className={cn(
                  'px-3 py-2 font-sans text-xs transition-colors',
                  activeTab === index ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                {tab.name}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-between py-2">
            <div className="text-xs text-zinc-400">{filename}</div>
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex items-center gap-1 font-sans text-xs text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
      <SyntaxHighlighter
        language={activeLanguage}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: 0,
          background: 'transparent',
          fontSize: '0.875rem',
        }}
        wrapLines
        showLineNumbers
        lineProps={(lineNumber: number) => {
          let backgroundColor = 'transparent';
          if (addedLines.includes(lineNumber)) {
            backgroundColor = 'rgba(34,197,94,0.15)';
          } else if (removedLines.includes(lineNumber)) {
            backgroundColor = 'rgba(239,68,68,0.15)';
          } else if (activeHighlightLines.includes(lineNumber)) {
            backgroundColor = 'rgba(255,255,255,0.1)';
          }
          return {
            style: {
              backgroundColor,
              display: 'block',
              width: '100%',
            },
          };
        }}
        PreTag="div"
      >
        {String(activeCode)}
      </SyntaxHighlighter>
    </div>
  );
}
