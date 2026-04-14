'use client';

/**
 * DeployPanel — rich content rendered inside the SmartDeployButton's
 * popover. Two unified rows (GitHub backup, cloud host) that map to the
 * user's mental model of "where my code is saved" + "where my site is
 * live". Every row is the same shape: brand icon on the left, title +
 * status subtitle in the middle, compact icon-only actions on the right.
 *
 * Visual language borrowed from the Codex/OpenAI app: neutral chrome,
 * brand colors carried ONLY by the leading icons, one accent pill per
 * row for active status, and icon-only action buttons instead of wide
 * colored CTAs. No nested amber-on-emerald-on-primary chip pileup.
 *
 * The panel is purely presentational — it composes hooks owned by the
 * SmartDeployButton's parent. All click handlers are passed in as props
 * so this file stays a thin renderer that's trivial to story-test.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Cloud,
  ExternalLink,
  RefreshCw,
  Rocket,
  Save,
  ScrollText,
  XCircle,
} from 'lucide-react';
import type { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import type { GitStatusDto } from '@/hooks/use-git-status';
import type { SmartDeployState } from '@/hooks/use-smart-deploy-state';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import { ProviderList, type ProviderListEntry } from './provider-list';
import { CLOUD_PROVIDER_BRAND_HEX, CLOUD_PROVIDER_ICONS, GitHubIcon } from './cloud-provider-icons';
import { PublishToGitHubForm, type PublishOwner } from './publish-to-github-modal';

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
  /** GitHub owner list for the inline publish subpanel. Null when the
   *  owners request hasn't completed yet — the Set-up-code-backup row
   *  still clicks through to `onSetUpCodeStorage` (legacy modal) as a
   *  graceful fallback in that window. */
  publishOwners?: readonly PublishOwner[] | null;
  /** Default repository name pre-filled into the inline form (slug). */
  publishDefaultRepoName?: string;
  /** Called when the inline form is submitted. Parent does the HTTP
   *  call + refreshes git status + opens the logs drawer. Throws to
   *  surface a validation error inline without closing the subpanel. */
  onPublishSubmit?(input: {
    ownerLogin: string;
    repoName: string;
    visibility: 'public' | 'private';
  }): Promise<void>;

  /** Click handlers — fire the corresponding hook actions. */
  onSaveChanges(): void;
  onPublishToWeb(): void;
  onRedeploy(): void;
  /** Legacy fallback for setting up code backup when the inline form
   *  isn't available (publishOwners still loading). Still wired so the
   *  user never hits a dead button during the orgs fetch. */
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

/**
 * A single service row — the atom of the panel. Brand icon on the left
 * (carries the only non-neutral color), title + subtitle in the middle,
 * an optional small status pill (live / syncing / out-of-date / off),
 * and compact icon-only action buttons on the right. All rows share
 * the exact same height and padding so the panel reads as a clean
 * stack instead of a collage of cards.
 */
type ServiceRowStatus = 'live' | 'dirty' | 'off' | 'working' | 'failed';

function ServiceRow({
  Icon,
  brandHex,
  title,
  subtitle,
  href,
  status,
  statusLabel,
  actions,
  expansion,
}: {
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  brandHex?: string;
  title: string;
  subtitle?: React.ReactNode;
  href?: string;
  status?: ServiceRowStatus;
  statusLabel?: string;
  actions: React.ReactNode;
  /** Optional collapsible area rendered directly under the row (used
   *  for the cloud provider switcher). Kept inside the same row so the
   *  visual hierarchy stays flat. */
  expansion?: React.ReactNode;
}) {
  const statusClass = status ? STATUS_PILL_CLASSES[status] : undefined;

  const titleNode = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-primary inline-flex items-center gap-1 truncate transition-colors"
      title={href}
    >
      <span className="truncate">{title}</span>
      <ExternalLink className="size-3 shrink-0 opacity-60" />
    </a>
  ) : (
    <span className="truncate">{title}</span>
  );

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className="size-5 shrink-0" style={brandHex ? { color: brandHex } : undefined} />
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-[12px] font-medium">{titleNode}</div>
          {subtitle ? (
            <div className="text-muted-foreground truncate text-[10px]">{subtitle}</div>
          ) : null}
        </div>
        {status && statusLabel ? (
          <span
            className={cn(
              'hidden shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide whitespace-nowrap uppercase sm:inline-block',
              statusClass
            )}
          >
            {statusLabel}
          </span>
        ) : null}
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </div>
      {expansion}
    </div>
  );
}

const STATUS_PILL_CLASSES: Record<ServiceRowStatus, string> = {
  live: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  dirty: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  off: 'bg-muted text-muted-foreground',
  working: 'bg-primary/10 text-primary',
  failed: 'bg-destructive/10 text-destructive',
};

/**
 * Compact icon-only action button. Codex style — square, neutral by
 * default, primary tinted only when `variant="primary"`. Always carries
 * a `title` attribute so it doubles as a tooltip.
 */
function IconAction({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick(): void;
  variant?: 'default' | 'primary';
  disabled?: boolean;
}) {
  const variantClass = {
    default: 'text-muted-foreground hover:text-foreground hover:bg-accent',
    primary: 'text-primary hover:bg-primary/10',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors',
        variantClass,
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <Icon className="size-3.5" />
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
  publishOwners = null,
  publishDefaultRepoName = '',
  onPublishSubmit,
  onSaveChanges,
  onPublishToWeb,
  onRedeploy,
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

  // ── Inline subpanel state (publish-to-github) ─────────────
  // Rendered as a slide-in view that replaces the main two-row panel
  // body when the user clicks "Set up code backup" on the GitHub row.
  // Kept local to the panel so the parent doesn't need to track it.
  const [subpanel, setSubpanel] = useState<'main' | 'publish'>('main');
  const canInlinePublish = Boolean(publishOwners && onPublishSubmit);
  const handleOpenPublishSubpanel = () => {
    if (canInlinePublish) {
      setSubpanel('publish');
    } else {
      // Orgs fetch still in-flight — fall back to the legacy modal
      // path so the button is never a dead click.
      onSetUpCodeStorage();
    }
  };
  const handleClosePublishSubpanel = () => setSubpanel('main');

  // Pull a friendly repo display name out of the remote URL —
  // "https://github.com/owner/repo.git" → "owner/repo".
  const remoteDisplay = gitStatus?.remoteUrl ? prettyRepoName(gitStatus.remoteUrl) : null;

  // ── Derive the GitHub row state ────────────────────────────
  const gitDirtyCount = gitStatus
    ? gitStatus.uncommittedCount + gitStatus.unpushedCount
    : state.changeCount;
  const gitSubtitle = hasRemote
    ? gitStatus
      ? gitStatus.uncommittedCount > 0
        ? `${gitStatus.uncommittedCount} unsaved change${gitStatus.uncommittedCount === 1 ? '' : 's'}`
        : gitStatus.unpushedCount > 0
          ? `${gitStatus.unpushedCount} change${gitStatus.unpushedCount === 1 ? '' : 's'} ready to push`
          : 'Up to date'
      : 'Loading…'
    : 'Save your code online so you never lose it';
  const gitTitle = hasRemote && remoteDisplay ? remoteDisplay : 'No backup yet';
  const gitHref = hasRemote ? normalizeRemoteHref(gitStatus?.remoteUrl ?? null) : undefined;
  const gitStatus_: ServiceRowStatus | undefined = !hasRemote
    ? 'off'
    : gitDirtyCount > 0
      ? 'dirty'
      : 'live';
  const gitStatusLabel = !hasRemote
    ? 'Off'
    : gitDirtyCount > 0
      ? `${gitDirtyCount} pending`
      : 'In sync';

  // ── Derive the cloud host row state ────────────────────────
  const hostTitle = cloudProviderName ?? 'Cloudflare Pages';
  const hostSubtitle = hasCloud
    ? liveUrl
      ? `Last published ${lastDeployedAgo ?? 'just now'}`
      : 'Connected — not yet published'
    : 'Click to connect a hosting provider';
  const hostStatus: ServiceRowStatus | undefined = isWorking
    ? 'working'
    : state.kind === 'failed' && state.failedSource === 'deploy'
      ? 'failed'
      : !hasCloud
        ? 'off'
        : liveUrl
          ? state.changeCount > 0 && hasRemote
            ? 'dirty'
            : 'live'
          : 'off';
  const hostStatusLabel: string | undefined = isWorking
    ? 'Working'
    : state.kind === 'failed' && state.failedSource === 'deploy'
      ? 'Failed'
      : !hasCloud
        ? 'Off'
        : liveUrl
          ? state.changeCount > 0 && hasRemote
            ? 'Out of sync'
            : 'Live'
          : 'Ready';

  // Prefer the real connected provider's brand icon over the
  // generic Cloud lucide when available.
  const selectedProviderId = cloudDeploy.state.provider ?? null;
  const HostIcon =
    selectedProviderId && CLOUD_PROVIDER_ICONS[selectedProviderId]
      ? CLOUD_PROVIDER_ICONS[selectedProviderId]
      : (Cloud as React.ComponentType<{ className?: string; style?: React.CSSProperties }>);
  const hostBrandHex = selectedProviderId
    ? CLOUD_PROVIDER_BRAND_HEX[selectedProviderId]
    : undefined;

  // ── Subpanel: publish to GitHub ──────────────────────────
  // Slide-in view that replaces the two-row main body with the
  // PublishToGitHubForm. Keeps the user inside the popover instead of
  // popping a separate Radix Dialog on top of it.
  if (subpanel === 'publish' && publishOwners && onPublishSubmit) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <button
            type="button"
            onClick={handleClosePublishSubpanel}
            aria-label="Back"
            className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <GitHubIcon className="size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-foreground text-[12px] font-semibold">Set up code backup</div>
            <div className="text-muted-foreground truncate text-[10px]">
              Publish to GitHub so you never lose your work
            </div>
          </div>
        </div>
        <PublishToGitHubForm
          owners={publishOwners.slice()}
          defaultRepoName={publishDefaultRepoName}
          variant="subpanel"
          onSubmit={async (input) => {
            await onPublishSubmit(input);
            // Success → drop back to the main view. Errors are caught
            // inside the form and surfaced as inline validation
            // without closing the subpanel.
            handleClosePublishSubpanel();
          }}
          onCancel={handleClosePublishSubpanel}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y">
      {/* ── GitHub / backup row ─────────────────────────────── */}
      <ServiceRow
        Icon={GitHubIcon}
        title={gitTitle}
        subtitle={gitSubtitle}
        href={gitHref}
        status={gitStatus_}
        statusLabel={gitStatusLabel}
        actions={
          hasRemote ? (
            <>
              <IconAction
                icon={Save}
                label={
                  gitDirtyCount > 0
                    ? `Save ${gitDirtyCount} change${gitDirtyCount === 1 ? '' : 's'}`
                    : 'Nothing to save'
                }
                onClick={onSaveChanges}
                variant={gitDirtyCount > 0 ? 'primary' : 'default'}
                disabled={isWorking || gitDirtyCount === 0}
              />
              <IconAction icon={ArrowUpRight} label="Open in GitHub" onClick={onOpenInGitHub} />
            </>
          ) : (
            <IconAction
              icon={GitHubIcon}
              label="Set up code backup"
              onClick={handleOpenPublishSubpanel}
              variant="primary"
            />
          )
        }
      />

      {/* ── Cloud host row ──────────────────────────────────── */}
      <ServiceRow
        Icon={HostIcon}
        brandHex={hostBrandHex}
        title={hostTitle}
        subtitle={hostSubtitle}
        href={liveUrl ?? undefined}
        status={hostStatus}
        statusLabel={hostStatusLabel}
        actions={
          hasCloud ? (
            <>
              <IconAction
                icon={liveUrl ? RefreshCw : Rocket}
                label={liveUrl ? 'Republish' : 'Publish to web'}
                onClick={liveUrl ? onRedeploy : onPublishToWeb}
                variant="primary"
                disabled={isWorking}
              />
              <IconAction icon={ScrollText} label="Activity log" onClick={onOpenLogs} />
            </>
          ) : (
            <IconAction
              icon={Cloud}
              label="Connect hosting"
              onClick={() => {
                const firstEnabled = providers.find((p) => p.enabled);
                if (firstEnabled) onConnectProvider(firstEnabled.id);
              }}
              variant="primary"
              disabled={isWorking}
            />
          )
        }
        expansion={
          <div className="px-4 pb-3">
            <ProviderList
              providers={providers}
              selectedProvider={selectedProviderId}
              loading={providersLoading}
              loadError={providersError}
              // The cloud host ServiceRow above already renders the
              // currently-selected provider as its own main row. Tell
              // the provider list to hide it so we don't render two
              // "Cloudflare Pages" rows stacked on top of each other —
              // the user just sees a "Change provider" chevron that
              // reveals the alternatives (and "Coming soon" stubs)
              // when clicked.
              hideSelected
              onSelectConnected={onSelectProvider}
              onSelectDisconnected={onConnectProvider}
              onEditConnection={onEditConnection}
            />
          </div>
        }
      />

      {/* Inline error surface — tucked under the relevant row so the
          user never needs to open the logs drawer for a one-line gist.
          NOTE: we deliberately do NOT render a "Working…" block here
          even though the state machine knows about it. The top-bar
          button already shows "Working…" as its primary label and the
          cloud host row already shows a "Working" status pill, so a
          third indicator in the panel footer was pure duplication. */}
      {state.kind === 'failed' && state.failedSource === 'deploy' ? (
        <div className="text-destructive flex items-start gap-1.5 px-4 py-2 text-[10px]">
          <XCircle className="mt-0.5 size-3 shrink-0" />
          <span className="break-words">{state.errorMessage}</span>
        </div>
      ) : state.kind === 'failed' && state.failedSource === 'sync' ? (
        <div className="text-destructive flex items-start gap-1.5 px-4 py-2 text-[10px]">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span className="break-words">{state.errorMessage}</span>
        </div>
      ) : null}

      {/* Note: onSaveAndPublish is no longer surfaced inside the panel.
          The top-bar button already promotes it via the saveAndRepublish
          state (amber "Save & republish" CTA), so a duplicate button
          inside the popover would be pure chrome noise. */}
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
