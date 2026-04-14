'use client';

/**
 * DeployPanel — rich content rendered inside the SmartDeployButton's
 * popover. Two visually distinct sections that map to the user's mental
 * model: "where my code is saved" + "where my site is live". Brand names
 * (GitHub, Cloudflare) appear only as small "powered by" subtitles, so a
 * non-technical user can skim the panel without ever seeing jargon.
 *
 * The panel is purely presentational — it composes hooks owned by the
 * SmartDeployButton's parent. All click handlers are passed in as props
 * so this file stays a thin renderer that's trivial to story-test.
 */

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import type { GitStatusDto } from '@/hooks/use-git-status';
import type { SmartDeployState } from '@/hooks/use-smart-deploy-state';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import { ProviderList, type ProviderListEntry } from './provider-list';
import { GitHubIcon } from './cloud-provider-icons';

export interface DeployPanelProps {
  state: SmartDeployState;
  gitStatus: GitStatusDto | null;
  cloudDeploy: CloudDeployActionApi;
  /** Stable display name of the connected cloud provider (e.g. "Cloudflare Pages"). */
  cloudProviderName: string | null;
  /** Time-ago string for the last successful deploy ("2 minutes ago"). */
  lastDeployedAgo: string | null;
  /** Full list of providers for the inline switcher (all 5 including
   *  the "Coming soon" stubs). Drives the list inside the "Live
   *  website" section so the user can see + pick any provider without
   *  needing a nested popover. */
  providers: readonly ProviderListEntry[];
  providersLoading?: boolean;
  providersError?: string | null;
  /** Click handlers — fire the corresponding hook actions. */
  onSaveChanges(): void;
  onPublishToWeb(): void;
  onRedeploy(): void;
  onSaveAndPublish(): void;
  onSetUpCodeStorage(): void;
  /** Called when the user clicks a connected provider row to switch to it.
   *  Should persist the selection and immediately run a deploy. */
  onSelectProvider(provider: CloudDeploymentProvider): void;
  /** Called when the user clicks an unconnected provider row — opens the
   *  connect-token modal. */
  onConnectProvider(provider: CloudDeploymentProvider): void;
  /** Called when the user clicks the pencil on a connected row. */
  onEditConnection(provider: CloudDeploymentProvider): void;
  onOpenLogs(): void;
  onOpenInGitHub(): void;
}

const SECTION_PADDING = 'px-4 py-3';

/** Section header — uppercase muted title + small "powered by" line. */
function SectionHeader({ title, poweredBy }: { title: string; poweredBy: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-foreground text-[11px] font-semibold tracking-wide uppercase">{title}</h3>
      <span className="text-muted-foreground text-[10px]">powered by {poweredBy}</span>
    </div>
  );
}

/** Compact row that shows a chip + state line. */
function StatusChip({
  icon: Icon,
  primary,
  secondary,
  tone = 'muted',
  href,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  primary: string;
  secondary?: string;
  tone?: 'muted' | 'emerald' | 'destructive' | 'amber';
  href?: string;
  onClick?: () => void;
}) {
  const toneClass = {
    muted: 'border-border/60 bg-muted/30',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    destructive: 'border-destructive/40 bg-destructive/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
  }[tone];

  const inner = (
    <div className={cn('flex items-center gap-2.5 rounded-md border p-2.5', toneClass)}>
      <Icon className="text-foreground/80 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{primary}</div>
        {secondary ? (
          <div className="text-muted-foreground truncate text-[10px]">{secondary}</div>
        ) : null}
      </div>
      {href ? <ExternalLink className="text-muted-foreground size-3" /> : null}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block cursor-pointer hover:brightness-110"
      >
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full cursor-pointer text-left hover:brightness-110"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

/** Inline action button used inside each section. */
function PanelAction({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick(): void;
  variant?: 'default' | 'primary' | 'destructive';
  disabled?: boolean;
}) {
  const variantClass = {
    default: 'border-border/70 bg-background hover:bg-accent text-foreground',
    primary: 'border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary',
    destructive: 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10 text-destructive',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors',
        variantClass,
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}

export function DeployPanel({
  state,
  gitStatus,
  cloudDeploy,
  cloudProviderName,
  lastDeployedAgo,
  providers,
  providersLoading = false,
  providersError = null,
  onSaveChanges,
  onPublishToWeb,
  onRedeploy,
  onSaveAndPublish,
  onSetUpCodeStorage,
  onSelectProvider,
  onConnectProvider,
  onEditConnection,
  onOpenLogs,
  onOpenInGitHub,
}: DeployPanelProps) {
  const hasRemote = state.hasRemote;
  const hasCloud = state.hasCloud;
  const liveUrl = state.liveUrl ?? cloudDeploy.state.url;
  const isWorking =
    state.kind === 'working' || cloudDeploy.state.isWorking || state.kind === 'loading';

  // Pull a friendly repo display name out of the remote URL —
  // "https://github.com/owner/repo.git" → "owner/repo".
  const remoteDisplay = gitStatus?.remoteUrl ? prettyRepoName(gitStatus.remoteUrl) : null;

  return (
    <div className="flex flex-col">
      {/* ── Top status strip — only when deployed ──────────────── */}
      {liveUrl ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex cursor-pointer items-center gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 transition-colors hover:bg-emerald-500/15"
          title="Open the live site"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              Your site is live
            </div>
            <div className="truncate font-mono text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
              {liveUrl.replace(/^https?:\/\//, '')}
            </div>
          </div>
          <ArrowUpRight className="size-3.5 text-emerald-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 dark:text-emerald-400" />
        </a>
      ) : null}

      {/* ── Section 1: Save & backup ─────────────────────────── */}
      <section className={cn(SECTION_PADDING, 'border-b')}>
        <SectionHeader title="Save & backup" poweredBy="GitHub" />
        <div className="mt-2.5 space-y-2.5">
          {hasRemote && remoteDisplay ? (
            <StatusChip
              icon={GitHubIcon}
              primary={remoteDisplay}
              secondary={
                gitStatus
                  ? gitStatus.uncommittedCount > 0
                    ? `${gitStatus.uncommittedCount} unsaved change${gitStatus.uncommittedCount === 1 ? '' : 's'}`
                    : gitStatus.unpushedCount > 0
                      ? `${gitStatus.unpushedCount} change${gitStatus.unpushedCount === 1 ? '' : 's'} ready to push`
                      : 'Up to date'
                  : 'Loading…'
              }
              tone={
                gitStatus && (gitStatus.uncommittedCount > 0 || gitStatus.unpushedCount > 0)
                  ? 'amber'
                  : 'emerald'
              }
              href={normalizeRemoteHref(gitStatus?.remoteUrl ?? null)}
            />
          ) : (
            <StatusChip
              icon={GitHubIcon}
              primary="No backup yet"
              secondary="Save your code online so you never lose it"
              tone="muted"
            />
          )}

          <div className="flex flex-wrap gap-1.5">
            {hasRemote ? (
              <>
                <PanelAction
                  icon={Save}
                  label={
                    state.changeCount > 0
                      ? `Save ${state.changeCount} change${state.changeCount === 1 ? '' : 's'}`
                      : 'Save changes'
                  }
                  onClick={onSaveChanges}
                  variant={state.changeCount > 0 ? 'primary' : 'default'}
                  disabled={isWorking || state.changeCount === 0}
                />
                <PanelAction icon={ArrowUpRight} label="Open in GitHub" onClick={onOpenInGitHub} />
              </>
            ) : (
              <PanelAction
                icon={GitHubIcon}
                label="Set up code backup"
                onClick={onSetUpCodeStorage}
                variant="primary"
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Section 2: Live website ──────────────────────────── */}
      <section className={SECTION_PADDING}>
        <SectionHeader title="Live website" poweredBy={cloudProviderName ?? 'Cloudflare Pages'} />
        <div className="mt-2.5 space-y-2.5">
          {/* Last-published status strip — only when we have a live URL. */}
          {liveUrl ? (
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <CheckCircle2 className="size-3 text-emerald-500" />
              <span>Last published {lastDeployedAgo ?? 'just now'}</span>
            </div>
          ) : null}

          {/* Provider list — ALL providers including "Coming soon" stubs
              so the user can see what's available and what's on the
              roadmap. This was the main thing the old DeployButton's
              nested dropdown gave you, flattened into the panel. */}
          <ProviderList
            providers={providers}
            selectedProvider={cloudDeploy.state.provider ?? null}
            loading={providersLoading}
            loadError={providersError}
            onSelectConnected={onSelectProvider}
            onSelectDisconnected={onConnectProvider}
            onEditConnection={onEditConnection}
          />

          <div className="flex flex-wrap gap-1.5">
            {hasCloud ? (
              <PanelAction
                icon={liveUrl ? RefreshCw : Rocket}
                label={liveUrl ? 'Republish' : 'Publish to web'}
                onClick={liveUrl ? onRedeploy : onPublishToWeb}
                variant="primary"
                disabled={isWorking}
              />
            ) : (
              <PanelAction
                icon={Cloud}
                label="Connect hosting"
                onClick={() => {
                  // Default the connect action to Cloudflare Pages (the
                  // only live provider in v1). Users who want a different
                  // one can click the row in the provider list above.
                  const firstEnabled = providers.find((p) => p.enabled);
                  if (firstEnabled) onConnectProvider(firstEnabled.id);
                }}
                variant="primary"
                disabled={isWorking}
              />
            )}
            <PanelAction icon={ScrollText} label="Activity log" onClick={onOpenLogs} />
          </div>

          {/* Inline error pill when deploy failed — pulls user attention
              without forcing them into the logs drawer for a one-line gist. */}
          {state.kind === 'failed' && state.failedSource === 'deploy' ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-1.5 rounded-md border p-2 text-[10px]">
              <XCircle className="mt-0.5 size-3 shrink-0" />
              <span className="break-words">{state.errorMessage}</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── Combined action — only visible when meaningful ───── */}
      {hasRemote && hasCloud && state.changeCount > 0 ? (
        <button
          type="button"
          onClick={onSaveAndPublish}
          disabled={isWorking}
          className={cn(
            'border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary group flex cursor-pointer items-center justify-center gap-2 border-t px-4 py-3 text-xs font-semibold transition-colors',
            isWorking && 'cursor-not-allowed opacity-60'
          )}
        >
          {isWorking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4 transition-transform group-hover:scale-110" />
          )}
          <span>
            Save &amp; publish everything
            {state.changeCount > 0
              ? ` (${state.changeCount} change${state.changeCount === 1 ? '' : 's'})`
              : ''}
          </span>
        </button>
      ) : null}

      {/* Sync error inline — same pattern as deploy error above. */}
      {state.kind === 'failed' && state.failedSource === 'sync' ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-1.5 border-t px-4 py-2.5 text-[10px]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span className="break-words">{state.errorMessage}</span>
        </div>
      ) : null}
    </div>
  );
}

/** "https://github.com/owner/repo(.git)?" → "owner/repo". */
function prettyRepoName(remoteUrl: string): string {
  try {
    const url = new URL(remoteUrl);
    const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    return path || url.host;
  } catch {
    // SSH-form like "git@github.com:owner/repo.git"
    const m = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return m?.[1] ?? remoteUrl;
  }
}

/** Normalize SSH form to https for click-to-open. */
function normalizeRemoteHref(remoteUrl: string | null): string | undefined {
  if (!remoteUrl) return undefined;
  if (remoteUrl.startsWith('http')) return remoteUrl.replace(/\.git$/, '');
  const m = remoteUrl.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return m ? `https://github.com/${m[1]}` : undefined;
}
