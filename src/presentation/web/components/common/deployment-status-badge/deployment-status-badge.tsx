'use client';

import { useState } from 'react';
import { Loader2, ExternalLink, Terminal } from 'lucide-react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ServerLogViewer } from '@/components/common/server-log-viewer';
import { isDeploymentActive } from '@/hooks/deployment-status-store';
import { getDeploymentStartingLabel } from '@/lib/deployment-state-copy';

export interface DeploymentStatusBadgeProps {
  status: DeploymentState | null;
  url?: string | null;
  targetId?: string;
}

const tbBtn =
  'text-muted-foreground hover:bg-foreground/8 hover:text-foreground inline-flex size-7 items-center justify-center rounded-[3px]';

export function DeploymentStatusBadge({ status, url, targetId }: DeploymentStatusBadgeProps) {
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const showLogButton = targetId && isDeploymentActive(status);

  switch (status) {
    case DeploymentState.Analyzing:
    case DeploymentState.Installing:
    case DeploymentState.Booting:
      return (
        <>
          <div className="flex items-center gap-1 pl-1">
            <Loader2 className="size-3 animate-spin text-blue-500" />
            <span className="text-muted-foreground text-[11px]">
              {getDeploymentStartingLabel(status)}
            </span>
            {showLogButton ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="View server logs"
                      className={tbBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogViewerOpen(true);
                      }}
                    >
                      <Terminal className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Server logs
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          {showLogButton ? (
            <ServerLogViewer
              open={logViewerOpen}
              onOpenChange={setLogViewerOpen}
              targetId={targetId}
            />
          ) : null}
        </>
      );
    case DeploymentState.Ready:
      return (
        <>
          <div className="flex translate-y-px items-center gap-1 pl-1">
            <span className="inline-block size-1.5 rounded-full bg-green-500" />
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-green-600 hover:text-green-500 dark:text-green-400 dark:hover:text-green-300"
                onClick={(e) => e.stopPropagation()}
              >
                {url}
                <ExternalLink className="size-2.5 shrink-0" />
              </a>
            ) : (
              <span className="text-[11px] text-green-600 dark:text-green-400">Ready</span>
            )}
            {showLogButton ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="View server logs"
                      className={tbBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogViewerOpen(true);
                      }}
                    >
                      <Terminal className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Server logs
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
          {showLogButton ? (
            <ServerLogViewer
              open={logViewerOpen}
              onOpenChange={setLogViewerOpen}
              targetId={targetId}
            />
          ) : null}
        </>
      );
    default:
      return null;
  }
}
