'use client';

/**
 * AppViewTabs — right-pane view switcher for the app top bar.
 *
 * Segmented-control style: a pill-shaped bg-muted container with each
 * view rendered as a rounded-sm button inside. Active tab sits on a
 * raised bg-background card with a subtle shadow; inactive tabs sink
 * into the container and reveal a soft hover background. Mirrors the
 * toolbar tab control in macOS Sonoma / Windows 11 Settings / VS Code
 * command palette — compact, rounded, depth-via-shadow not stripes.
 *
 * Folds in the old standalone `RunDevButton` ("Preview") functionality:
 * the Web tab now owns the local dev-server lifecycle. Clicking the Web
 * tab while no server is running starts it AND switches the view in one
 * click — same one-button experience as the old Preview button. The
 * Web tab's icon flips to a state-aware indicator (idle / spinner /
 * pulsing green dot / red triangle) so a glance at the tab tells the
 * user what's going on, without needing a second top-bar control.
 *
 * Stop is reachable from inside the Web pane content (web-preview-tab
 * URL bar) — that's the natural place: when you're looking at the live
 * preview is when you want a stop button, not when you're on a
 * different tab.
 */

import { useCallback } from 'react';
import { Code2, Globe, Loader2, Terminal, TriangleAlert } from 'lucide-react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DeployActionState } from '@/hooks/use-deploy-action';

export const VIEW_TABS = ['ide', 'terminal', 'web'] as const;
export type AppView = (typeof VIEW_TABS)[number];

export const VIEW_LABELS: Record<AppView, string> = {
  ide: 'IDE',
  terminal: 'Terminal',
  web: 'Web',
};

const VIEW_ICONS: Record<AppView, React.ComponentType<{ className?: string }>> = {
  ide: Code2,
  terminal: Terminal,
  web: Globe,
};

export interface AppViewTabsProps {
  active: AppView;
  onChange: (view: AppView) => void;
  /** Tabs that should be visually disabled (e.g. while agent is running). */
  disabledTabs?: AppView[];
  /** Shared dev-server state. Drives the Web tab's status indicator + auto-start behavior. */
  deploy: DeployActionState;
}

type WebStatus = 'idle' | 'booting' | 'ready' | 'error';

function deriveWebStatus(deploy: DeployActionState): WebStatus {
  if (deploy.deployError) return 'error';
  if (deploy.status === DeploymentState.Booting || deploy.deployLoading) return 'booting';
  if (deploy.status === DeploymentState.Ready && deploy.url) return 'ready';
  return 'idle';
}

function webTooltip(status: WebStatus, deploy: DeployActionState): string {
  switch (status) {
    case 'ready':
      return `Live preview running at ${deploy.url} — click to view`;
    case 'booting':
      return 'Starting dev server… click to view progress';
    case 'error':
      return `Dev server failed: ${deploy.deployError ?? 'unknown error'} — click Web tab to retry`;
    default:
      return 'Click to start the local dev server and preview the app';
  }
}

export function AppViewTabs({ active, onChange, disabledTabs = [], deploy }: AppViewTabsProps) {
  const webStatus = deriveWebStatus(deploy);

  const handleTabChange = useCallback(
    (value: string) => {
      const next = value as AppView;
      onChange(next);
      if (next === 'web' && (webStatus === 'idle' || webStatus === 'error')) {
        void deploy.deploy();
      }
    },
    [onChange, webStatus, deploy]
  );

  return (
    <TooltipProvider delayDuration={400}>
      <Tabs value={active} onValueChange={handleTabChange} className="contents">
        <TabsList
          className={cn(
            'bg-muted/60 border-border/60 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border p-0.5'
          )}
        >
          {VIEW_TABS.map((view) => {
            const Icon = VIEW_ICONS[view];
            const disabled = disabledTabs.includes(view);
            const tooltip = view === 'web' ? webTooltip(webStatus, deploy) : VIEW_LABELS[view];

            const trigger = (
              <TabsTrigger
                value={view}
                disabled={disabled}
                className={cn(
                  'text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[12px] font-medium whitespace-nowrap',
                  'transition-all duration-150 ease-out',
                  'data-[state=inactive]:hover:bg-background/60',
                  'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs',
                  'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
                  disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                  !disabled && 'cursor-pointer'
                )}
              >
                {view === 'web' ? (
                  <WebTabIcon status={webStatus} BaseIcon={Icon} />
                ) : (
                  <Icon className="size-3.5" />
                )}
                {VIEW_LABELS[view]}
              </TabsTrigger>
            );

            return (
              <Tooltip key={view}>
                <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} className="max-w-xs text-[11px]">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TabsList>
      </Tabs>
    </TooltipProvider>
  );
}

/**
 * Web-tab icon — swaps glyph + adds a status overlay dot based on the
 * dev-server state. Separate component so the TabsTrigger markup stays
 * scannable.
 */
function WebTabIcon({
  status,
  BaseIcon,
}: {
  status: WebStatus;
  BaseIcon: React.ComponentType<{ className?: string }>;
}) {
  if (status === 'booting') {
    return <Loader2 className="text-primary size-3.5 animate-spin" />;
  }
  if (status === 'error') {
    return <TriangleAlert className="text-destructive size-3.5" />;
  }
  return (
    <span className="relative inline-flex">
      <BaseIcon className="size-3.5" />
      {status === 'ready' ? (
        <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 inline-flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      ) : null}
    </span>
  );
}
