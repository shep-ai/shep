'use client';

/**
 * AppViewTabs — right-pane view switcher for the app top bar.
 *
 * Rebuild of the old pill-style ViewSwitcher to match the visual
 * language of FeatureDrawerTabs: VS Code-style flat tabs with a top
 * accent border on the active tab, right border between tabs, and
 * 13px medium label.
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

  // Web tab click — switches view AND starts the dev server when idle/error.
  // Booting/ready states just switch view (the pane content shows the live
  // state). Wrapped in useCallback so identity is stable for Radix Tabs.
  const handleTabChange = useCallback(
    (value: string) => {
      const next = value as AppView;
      onChange(next);
      if (next === 'web' && (webStatus === 'idle' || webStatus === 'error')) {
        // Fire-and-forget — the WebPreviewTab will render the booting UI
        // as the deploy state transitions through its hook.
        void deploy.deploy();
      }
    },
    [onChange, webStatus, deploy]
  );

  return (
    <TooltipProvider delayDuration={400}>
      <Tabs value={active} onValueChange={handleTabChange} className="contents">
        <TabsList className="bg-muted/40 h-9 shrink-0 justify-start gap-0 rounded-none border-0 p-0">
          {VIEW_TABS.map((view, idx) => {
            const Icon = VIEW_ICONS[view];
            const disabled = disabledTabs.includes(view);
            const isLast = idx === VIEW_TABS.length - 1;
            const tooltip = view === 'web' ? webTooltip(webStatus, deploy) : VIEW_LABELS[view];

            const trigger = (
              <TabsTrigger
                value={view}
                disabled={disabled}
                className={cn(
                  'text-muted-foreground hover:bg-muted hover:text-foreground',
                  'data-[state=active]:bg-background data-[state=active]:text-foreground',
                  'data-[state=active]:font-semibold',
                  '[&:not([data-state=active])]:border-r-border',
                  'relative h-9 rounded-none border-r border-r-transparent',
                  'bg-transparent px-3 text-[12px] font-medium shadow-none transition-none',
                  'cursor-pointer data-[state=active]:shadow-none',
                  isLast && 'last:border-r-transparent',
                  disabled && 'cursor-not-allowed opacity-40'
                )}
              >
                {/* State-aware icon for the Web tab; static icon for IDE/Terminal. */}
                {view === 'web' ? (
                  <WebTabIcon status={webStatus} BaseIcon={Icon} />
                ) : (
                  <Icon className="mr-1.5 size-3.5" />
                )}
                {VIEW_LABELS[view]}
                {/* Bottom accent bar — rendered as a real div so it
                    is 100% immune to Tailwind CSS variable cascade
                    issues. Same 2px primary colour as the smart deploy
                    button's bottom accent. */}
                {active === view ? (
                  <span className="bg-primary absolute bottom-0 left-0 h-0.5 w-full" />
                ) : null}
              </TabsTrigger>
            );

            return (
              <Tooltip key={view}>
                <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4} className="max-w-xs text-[11px]">
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
 * Web-tab icon that swaps glyph + adds a status overlay dot based on
 * the dev-server state. Kept as its own component so the Tab trigger
 * markup stays scannable.
 */
function WebTabIcon({
  status,
  BaseIcon,
}: {
  status: WebStatus;
  BaseIcon: React.ComponentType<{ className?: string }>;
}) {
  if (status === 'booting') {
    return <Loader2 className="text-primary mr-1.5 size-3.5 animate-spin" />;
  }
  if (status === 'error') {
    return <TriangleAlert className="text-destructive mr-1.5 size-3.5" />;
  }
  return (
    <span className="relative mr-1.5 inline-flex">
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
