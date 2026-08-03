'use client';

import { useState } from 'react';
import {
  Copy,
  ExternalLink,
  Terminal,
  MessageSquare,
  Clock,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getAgentTypeIcon } from '@/components/common/feature-node/agent-type-icons';
import {
  adoptAgentSession,
  resumeAgentSession,
  describeResumeCommand,
} from '@/app/actions/adopt-agent-session';
import type { SessionSummary } from './session-summary';
import { formatRelativeTime, isSessionActive, truncatePreview } from './session-summary';

export interface SessionRowProps {
  session: SessionSummary;
  /** Working directory the session is resumed in */
  repositoryPath: string;
  /** Called after a successful adoption, with the new feature id */
  onAdopted?: (featureId: string) => void;
  /** Called after a session is resumed in the embedded terminal */
  onResumed?: (terminalId: string) => void;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * One agent session, with the actions available for it.
 *
 * Every action delegates to a server action backed by a use case — this
 * component never composes a resume command or an agent prompt itself. The
 * previous implementation built both inline, which is how the broken
 * `claude --resume <id> --project <path>` command shipped.
 */
export function SessionRow({ session, repositoryPath, onAdopted, onResumed }: SessionRowProps) {
  const sessionActive = isSessionActive(session);
  const AgentIcon = getAgentTypeIcon(session.agentType);
  const [busy, setBusy] = useState<'adopt' | 'resume' | null>(null);
  const [error, setError] = useState('');

  const agentType = session.agentType ?? '';

  async function handleAdopt() {
    setBusy('adopt');
    setError('');
    const result = await adoptAgentSession({
      sessionId: session.id,
      agentType,
      repositoryPath,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.featureId) onAdopted?.(result.featureId);
  }

  async function handleResume() {
    setBusy('resume');
    setError('');
    const result = await resumeAgentSession({
      sessionId: session.id,
      agentType,
      cwd: repositoryPath,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.terminalId) onResumed?.(result.terminalId);
  }

  async function handleCopyCommand() {
    const result = await describeResumeCommand({
      sessionId: session.id,
      agentType,
      cwd: repositoryPath,
    });

    if (result.command) {
      await copyToClipboard(result.command);
      return;
    }
    setError(result.error ?? 'Cannot resume this session');
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex items-start gap-2 py-2 pe-2">
        <div className="relative mt-0.5 shrink-0">
          <AgentIcon className="h-4 w-4" />
          {sessionActive ? (
            <span className="border-background absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border bg-emerald-500" />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs leading-tight">{truncatePreview(session.preview)}</span>

          <div className="text-muted-foreground flex items-center gap-2 text-[10px] leading-tight">
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" />
              {session.messageCount}
            </span>
            {session.firstMessageAt ? (
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {new Date(session.firstMessageAt).toLocaleDateString()}
              </span>
            ) : null}
            {session.lastMessageAt ? (
              <span
                className={cn(
                  'ml-auto shrink-0',
                  sessionActive ? 'font-medium text-emerald-600' : ''
                )}
              >
                {formatRelativeTime(session.lastMessageAt)}
              </span>
            ) : null}
          </div>

          {error ? <span className="text-destructive text-[10px]">{error}</span> : null}
        </div>
      </DropdownMenuSubTrigger>

      <DropdownMenuPortal>
        <DropdownMenuSubContent
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            className="gap-2 text-xs font-medium text-violet-700 focus:bg-violet-50 focus:text-violet-800"
            disabled={busy !== null}
            onSelect={(e) => {
              e.preventDefault();
              void handleAdopt();
            }}
            data-testid="session-action-adopt"
          >
            {busy === 'adopt' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            )}
            Adopt as feature
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 text-xs"
            disabled={busy !== null}
            onSelect={(e) => {
              e.preventDefault();
              void handleResume();
            }}
            data-testid="session-action-resume"
          >
            {busy === 'resume' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Terminal className="h-3.5 w-3.5" />
            )}
            Resume in terminal
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => {
              window.open(`vscode://file${repositoryPath}`, '_blank');
            }}
            data-testid="session-action-ide"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in IDE
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={(e) => {
              e.preventDefault();
              void handleCopyCommand();
            }}
            data-testid="session-action-copy-command"
          >
            <Terminal className="h-3.5 w-3.5" />
            Copy resume command
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => void copyToClipboard(session.id)}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy session ID
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
