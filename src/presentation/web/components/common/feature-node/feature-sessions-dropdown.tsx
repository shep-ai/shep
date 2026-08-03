'use client';

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { History, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSessionsContext } from '@/hooks/sessions-provider';
import { SessionRow } from './session-row';

export type { SessionSummary } from './session-summary';

interface FeatureSessionsDropdownProps {
  repositoryPath: string;
  className?: string;
  /** When true, also scan worktree session directories (used by repo nodes). */
  includeWorktrees?: boolean;
  /** Called after a session is adopted into a feature. */
  onAdopted?: (featureId: string) => void;
  /** Called after a session is resumed in the embedded terminal. */
  onResumed?: (terminalId: string) => void;
}

const PREVIEW_COUNT = 3;

/** Stop both click and pointerDown from reaching React Flow's node selection handler */
function stopNodeEvent(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export function FeatureSessionsDropdown({
  repositoryPath,
  className,
  onAdopted,
  onResumed,
}: FeatureSessionsDropdownProps) {
  const { t } = useTranslation('web');
  const [expanded, setExpanded] = useState(false);

  // Sessions come from the centralized SessionsProvider context, which
  // batch-fetches every 30s — no per-instance HTTP calls.
  const { getSessionsForPath, hasActiveSessions: hasActiveForPath } = useSessionsContext();
  const sessions = getSessionsForPath(repositoryPath);
  const active = hasActiveForPath(repositoryPath);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) setExpanded(false);
  }, []);

  const visibleSessions = expanded ? sessions : sessions.slice(0, PREVIEW_COUNT);
  const hasMore = sessions.length > PREVIEW_COUNT;

  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('featureNode.viewSessions')}
                data-testid="feature-node-sessions-button"
                className={cn(
                  'nodrag relative flex h-5 cursor-pointer items-center gap-0.5 rounded px-0.5 text-[10px] transition-colors',
                  'text-muted-foreground hover:text-foreground hover:bg-muted',
                  className
                )}
                onClick={stopNodeEvent}
                onPointerDown={stopNodeEvent}
              >
                <History className="h-3 w-3 shrink-0" />
                {sessions.length > 0 ? (
                  <span data-testid="feature-node-sessions-count">{sessions.length}</span>
                ) : null}
                {active ? (
                  <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ) : null}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">
            {active ? t('featureNode.sessionsActive') : t('featureNode.sessions')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-80"
        onClick={stopNodeEvent}
        onPointerDown={stopNodeEvent}
      >
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
          <History className="h-3 w-3" />
          {t('featureNode.agentSessions')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {sessions.length === 0 ? (
          <div className="text-muted-foreground py-4 text-center text-xs">
            {t('featureNode.noSessionsFound')}
          </div>
        ) : (
          <>
            {visibleSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                repositoryPath={repositoryPath}
                onAdopted={onAdopted}
                onResumed={onResumed}
              />
            ))}

            {hasMore ? (
              <DropdownMenuItem
                className="text-muted-foreground justify-center gap-1 py-1.5 text-[10px]"
                onClick={(e) => {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }}
              >
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')}
                />
                {expanded
                  ? t('featureNode.showLess')
                  : t('featureNode.showMore', { count: sessions.length - PREVIEW_COUNT })}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
