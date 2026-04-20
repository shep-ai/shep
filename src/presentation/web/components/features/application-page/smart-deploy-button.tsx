'use client';

/**
 * SmartDeployButton — single primary action surface for the app top bar.
 *
 * One split button that replaces the old PublishToGitHubButton +
 * DeployButton + a hypothetical SyncButton. The left half runs the
 * most-likely-intended action based on the combined git + cloud state;
 * the chevron half opens the rich DeployPanel for full control.
 *
 * Visual: native desktop toolbar split button. h-8, rounded-md ends,
 * subtle 1px border, matching tone-tinted background, shadow-xs for
 * depth. Hover bumps the tint a level, active inverts to a pressed
 * feel, focus adds a ring. 150ms transitions across the board. Labels
 * never say "repo", "sync", "push", or "commit" — this button is used
 * by non-technical people.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { SmartDeployState } from '@/hooks/use-smart-deploy-state';

export interface SmartDeployButtonProps {
  state: SmartDeployState;
  /** Run the primary action (left half click). */
  onPrimaryClick(): void;
  /** Panel content rendered inside the popover. */
  panel: React.ReactNode;
  /** Controlled popover open state. When provided, the parent owns the
   *  open/close lifecycle — used so the primary-click handler can pop the
   *  panel open for states like `getOnline` that need the user to pick a
   *  path instead of committing to a specific action. */
  panelOpen?: boolean;
  onPanelOpenChange?(open: boolean): void;
  className?: string;
}

interface LabelSpec {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  tone: 'primary' | 'emerald' | 'amber' | 'destructive' | 'muted' | 'rocket';
  spinning?: boolean;
  /** When true, the icon renders inside a vibrant gradient chip — reserved
   *  for the one-click "Get online" surface that should visually pop. */
  iconChip?: boolean;
}

function labelFor(state: SmartDeployState): LabelSpec {
  switch (state.kind) {
    case 'loading':
      return { icon: Loader2, label: 'Loading…', tone: 'muted', spinning: true };
    case 'working': {
      if (state.workingSource === 'getOnline') {
        return {
          icon: Loader2,
          label: 'Getting online…',
          tone: 'rocket',
          spinning: true,
          iconChip: true,
        };
      }
      if (state.workingSource === 'sync') {
        return { icon: Loader2, label: 'Syncing code', tone: 'primary', spinning: true };
      }
      if (state.workingSource === 'deploy') {
        return {
          icon: Loader2,
          label: `Deploying to ${state.cloudProviderName ?? 'cloud'}`,
          tone: 'primary',
          spinning: true,
        };
      }
      return { icon: Loader2, label: 'Working…', tone: 'primary', spinning: true };
    }
    case 'failed':
      return { icon: AlertTriangle, label: 'Try again', tone: 'destructive' };
    case 'pushAndDeploy':
      return {
        icon: Sparkles,
        label: 'Save & publish',
        sub:
          state.changeCount > 0
            ? `${state.changeCount} change${state.changeCount === 1 ? '' : 's'}`
            : undefined,
        tone: 'primary',
      };
    case 'saveAndRepublish':
      return {
        icon: RefreshCw,
        label: 'Save & republish',
        sub:
          state.changeCount > 0
            ? `${state.changeCount} change${state.changeCount === 1 ? '' : 's'} not live`
            : 'Not in sync',
        tone: 'amber',
      };
    case 'save':
      return {
        icon: Save,
        label: state.changeCount === 1 ? 'Save 1 change' : `Save ${state.changeCount} changes`,
        tone: 'primary',
      };
    case 'deploy':
      return { icon: Rocket, label: 'Publish to web', tone: 'primary' };
    case 'live':
      return {
        icon: Check,
        label: 'Live',
        sub: state.liveUrl ? truncateHost(state.liveUrl) : undefined,
        tone: 'emerald',
      };
    case 'getOnline':
      return { icon: Rocket, label: 'Get online', tone: 'rocket', iconChip: true };
    default:
      return { icon: Rocket, label: 'Get online', tone: 'rocket', iconChip: true };
  }
}

function truncateHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host.length > 24 ? `${u.host.slice(0, 21)}…` : u.host;
  } catch {
    return url.length > 24 ? `${url.slice(0, 21)}…` : url;
  }
}

/**
 * Tone classes — native-toolbar split button.
 *
 * Every tone is a (border, background, text, hover) tuple. `primary` is
 * the default "needs your attention" tone; `emerald` is a calm success
 * state; `amber` flags "your live site is behind"; `destructive` is
 * failure; `muted` is idle/loading; `rocket` is the vibrant one-click
 * Get-online action. Backgrounds stay subtle (5-10% tint) so the button
 * reads as a toolbar control, not a hero CTA.
 */
const TONE_CLASSES: Record<LabelSpec['tone'], string> = {
  primary:
    'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 active:bg-primary/15 dark:bg-primary/10 dark:hover:bg-primary/15 dark:active:bg-primary/20',
  emerald:
    'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 active:bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15 dark:active:bg-emerald-500/20',
  amber:
    'border-amber-500/30 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 active:bg-amber-500/15 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 dark:active:bg-amber-500/20',
  destructive:
    'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 active:bg-destructive/15 dark:bg-destructive/10 dark:hover:bg-destructive/15 dark:active:bg-destructive/20',
  muted: 'border-border bg-background text-muted-foreground hover:bg-accent active:bg-accent/80',
  rocket:
    'border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-700 hover:bg-fuchsia-500/10 active:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:bg-fuchsia-500/10 dark:hover:bg-fuchsia-500/15 dark:active:bg-fuchsia-500/20',
};

export function SmartDeployButton({
  state,
  onPrimaryClick,
  panel,
  panelOpen: controlledPanelOpen,
  onPanelOpenChange,
  className,
}: SmartDeployButtonProps) {
  const spec = labelFor(state);
  const Icon = spec.icon;
  const [internalPanelOpen, setInternalPanelOpen] = useState(false);
  const panelOpen = controlledPanelOpen ?? internalPanelOpen;
  const setPanelOpen = (open: boolean): void => {
    if (onPanelOpenChange) {
      onPanelOpenChange(open);
    } else {
      setInternalPanelOpen(open);
    }
  };

  const isInteractive = state.kind !== 'loading' && state.kind !== 'working';
  const isDirty = state.changeCount > 0 && state.hasRemote;

  return (
    <div className={cn('inline-flex items-stretch shadow-xs', className)}>
      {/* ── Left: smart primary action ───────────────────────── */}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={!isInteractive}
        className={cn(
          'group inline-flex h-8 items-center gap-2 rounded-l-md border border-r-0 px-3 text-xs font-medium',
          'transition-colors duration-150 ease-out',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
          'focus-visible:relative focus-visible:z-10',
          TONE_CLASSES[spec.tone],
          isInteractive ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        )}
        title={spec.label}
      >
        <span
          className={cn(
            'relative inline-flex',
            spec.iconChip &&
              'h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-sky-500 text-white shadow-xs'
          )}
        >
          <Icon
            className={cn(
              'shrink-0',
              spec.iconChip ? 'size-3' : 'size-3.5',
              spec.spinning && 'animate-spin'
            )}
          />
          {/* Tiny dirty-dot overlay on the icon when there are pending changes
              and we're NOT already showing them in the label. */}
          {isDirty &&
          state.kind !== 'save' &&
          state.kind !== 'pushAndDeploy' &&
          state.kind !== 'saveAndRepublish' &&
          state.kind !== 'working' &&
          state.kind !== 'loading' &&
          state.kind !== 'failed' ? (
            <span className="bg-primary absolute -end-0.5 -top-0.5 size-1.5 rounded-full" />
          ) : null}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span>{spec.label}</span>
          {spec.sub ? (
            <span className="text-muted-foreground text-[9px] font-normal">{spec.sub}</span>
          ) : null}
        </span>
      </button>

      {/* ── Right: chevron → opens DeployPanel popover ───────── */}
      <Popover open={panelOpen} onOpenChange={setPanelOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Open deploy panel"
            title="More options"
            className={cn(
              'inline-flex h-8 items-center justify-center rounded-r-md border px-1.5',
              'transition-colors duration-150 ease-out',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:outline-none',
              'focus-visible:relative focus-visible:z-10',
              'data-[state=open]:bg-accent/60',
              TONE_CLASSES[spec.tone],
              'cursor-pointer'
            )}
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform duration-150 ease-out',
                panelOpen && 'rotate-180'
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-[360px] p-0">
          {panel}
        </PopoverContent>
      </Popover>
    </div>
  );
}
