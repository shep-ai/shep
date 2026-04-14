'use client';

/**
 * SmartDeployButton — single primary action surface for the app top bar.
 *
 * One split button that replaces the old PublishToGitHubButton +
 * DeployButton + a hypothetical SyncButton. The left half runs the
 * most-likely-intended action based on the combined git + cloud state;
 * the chevron half opens the rich DeployPanel for full control.
 *
 * Visual design intent: read at a glance, no jargon. Target user is
 * non-technical — labels never say "repo", "sync", "push", or "commit".
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
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

/**
 * State-driven label + icon + tone. `tone` maps to a Tailwind colour band
 * applied via the className builder below — `primary` is the default
 * "needs your attention" tone, `emerald` is success-quiet, `destructive`
 * is failure, `muted` is idle.
 */
interface LabelSpec {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  tone: 'primary' | 'emerald' | 'amber' | 'destructive' | 'muted';
  spinning?: boolean;
}

function labelFor(state: SmartDeployState): LabelSpec {
  switch (state.kind) {
    case 'loading':
      return { icon: Loader2, label: 'Loading…', tone: 'muted', spinning: true };
    case 'working': {
      // Specific-per-source label instead of the generic "Working…".
      // Sync: we're doing the git commit+push pipeline. Deploy: the
      // cloud provider is shipping the build. Fallback stays as
      // "Working…" for any edge case where source isn't set.
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
        // Amber instead of emerald so the "your live site is behind"
        // state looks visibly different from the calm "Live" chip.
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
      return { icon: Cloud, label: 'Get online', tone: 'primary' };
    default:
      return { icon: Cloud, label: 'Get online', tone: 'primary' };
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
 * Tone classes — square, flat, VS-Code-tab-style.
 *
 * Neutral `border-border` all around so the button always sits as a
 * clean rectangle with no rounded corners, and a 2px BOTTOM accent
 * bar (`border-b-2 border-b-<tone>`) that carries the state color on
 * a single side only. Subtle background tint + matching text/icon
 * color complete the tone without painting the whole frame green or
 * amber.
 *
 * Sits next to `app-view-tabs` in the top bar so the whole row reads
 * as one flat rectangular family.
 */
const TONE_CLASSES: Record<LabelSpec['tone'], string> = {
  primary:
    'border-border border-b-2 border-b-primary bg-primary/5 text-primary hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/15',
  emerald:
    'border-border border-b-2 border-b-emerald-500 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15',
  amber:
    'border-border border-b-2 border-b-amber-500 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/15',
  destructive:
    'border-border border-b-2 border-b-destructive bg-destructive/5 text-destructive hover:bg-destructive/10 dark:bg-destructive/10 dark:hover:bg-destructive/15',
  muted:
    'border-border border-b-2 border-b-transparent bg-background text-muted-foreground hover:bg-accent',
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
  // Support both controlled and uncontrolled use. Storybook stories
  // still render the button without a parent popover state, so keep
  // an internal fallback for those cases.
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
    <div className={cn('inline-flex items-stretch', className)}>
      {/* ── Left: smart primary action ───────────────────────── */}
      <button
        type="button"
        onClick={onPrimaryClick}
        disabled={!isInteractive}
        className={cn(
          // Square, flat, VS-Code-tab language. The 2px top accent
          // comes from the tone class; the rest of the frame stays
          // neutral so "green everywhere" can't happen anymore.
          'inline-flex h-9 items-center gap-2 rounded-none border border-r-0 px-3 text-xs font-medium transition-colors',
          TONE_CLASSES[spec.tone],
          isInteractive ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
        )}
        title={spec.label}
      >
        <span className="relative inline-flex">
          <Icon className={cn('size-3.5 shrink-0', spec.spinning && 'animate-spin')} />
          {/* Tiny dirty-dot overlay on the icon when there are pending changes
              and we're NOT already showing them in the label. Hidden for
              states whose label already communicates the state so we don't
              double-indicate: save, pushAndDeploy, saveAndRepublish,
              working, loading, failed. */}
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
              // Square chevron half, same top accent as the main
              // button so the split reads as one rectangle with a
              // single vertical divider between the two halves.
              'inline-flex h-9 items-center justify-center rounded-none border px-1.5 transition-colors',
              TONE_CLASSES[spec.tone],
              'cursor-pointer'
            )}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-[360px] p-0">
          {panel}
        </PopoverContent>
      </Popover>
    </div>
  );
}
