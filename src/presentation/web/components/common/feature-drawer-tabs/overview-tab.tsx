'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSearch,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Info,
  Loader2,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { InlineAttachments } from '@/components/common/inline-attachments';
import { PrStatus } from '@shepai/core/domain/generated/output';
import type { CodeReview } from '@shepai/core/domain/generated/output';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CiStatusBadge } from '@/components/common/ci-status-badge';
import { CometSpinner } from '@/components/ui/comet-spinner';
import { ActionButton } from '@/components/common/action-button';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { triggerReview } from '@/app/actions/trigger-review';
import { CodeReviewPanel } from '@/components/features/code-review/code-review-panel';
import { featureNodeStateConfig } from '@/components/common/feature-node';
import type { FeatureNodeData } from '@/components/common/feature-node';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';
import {
  getAgentTypeIcon,
  agentTypeLabels,
} from '@/components/common/feature-node/agent-type-icons';
import { getModelMeta } from '@/lib/model-metadata';
import { formatDuration } from '@/lib/format-duration';
import type { BranchSyncData } from '@/hooks/use-branch-sync-status';
import { canSwitchPinnedConfig, type FeatureDrawerPinnedConfig } from './pinned-config-utils';

// ── Primitives ──────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-4 pb-1">
      <div className="text-foreground mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-wider uppercase">
        <Icon className="size-4 opacity-50" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-muted/60 rounded-md border border-transparent p-3', className)}>
      {children}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-foreground/40 text-[11px] font-medium tracking-wider uppercase">
        {label}
      </span>
      <span className="text-sm leading-snug">{children}</span>
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
        on
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-foreground/[0.04] text-foreground/25'
      )}
    >
      {on ? <Check className="size-3" /> : <X className="size-3" />}
      {label}
    </span>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: string | number): string {
  const now = Date.now();
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const diffMs = now - time;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 30)
    return new Date(time).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHr > 0) return `${diffHr}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

function useElapsedTime(startedAt?: number): string | null {
  const [elapsed, setElapsed] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(null);
      return;
    }
    setElapsed(formatDuration(Math.max(0, Date.now() - startedAt)));
    intervalRef.current = setInterval(() => {
      setElapsed(formatDuration(Math.max(0, Date.now() - startedAt)));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);
  return elapsed;
}

const prColor: Record<PrStatus, string> = {
  [PrStatus.Open]: 'text-blue-600 dark:text-blue-400',
  [PrStatus.Merged]: 'text-purple-600 dark:text-purple-400',
  [PrStatus.Closed]: 'text-red-600 dark:text-red-400',
};

// ── Main ────────────────────────────────────────────────────────────

export interface OverviewTabProps {
  data: FeatureNodeData;
  pinnedConfig?: FeatureDrawerPinnedConfig;
  syncStatus?: BranchSyncData | null;
  syncLoading?: boolean;
  syncError?: string | null;
  onRefreshSync?: () => void;
  onRebaseOnMain?: () => void;
  rebaseLoading?: boolean;
  rebaseError?: string | null;
}

export function OverviewTab({
  data,
  pinnedConfig,
  syncStatus,
  syncLoading,
  syncError,
  onRefreshSync,
  onRebaseOnMain,
  rebaseLoading,
  rebaseError,
}: OverviewTabProps) {
  const featureFlags = useFeatureFlags();
  const isCompleted = data.lifecycle === 'maintain';
  const isRunning = data.state === 'running' || data.state === 'action-required';
  const elapsedTime = useElapsedTime(isRunning ? data.startedAt : undefined);
  const config = featureNodeStateConfig[data.state];
  const showSummary =
    Boolean(data.summary) && !(data.userQuery && data.summary?.trim() === data.userQuery.trim());

  // Code review state
  const [reviewResult, setReviewResult] = useState<CodeReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewing, startReviewTransition] = useTransition();
  const [isPosting, startPostTransition] = useTransition();

  const showReviewButton = featureFlags.codeReview && data.pr;

  const handleTriggerReview = () => {
    if (!data.pr) return;
    setReviewError(null);
    setReviewResult(null);
    startReviewTransition(async () => {
      const result = await triggerReview({
        target: data.pr!.url,
        repositoryPath: data.repositoryPath,
        featureId: data.featureId,
      });
      if (result.error) {
        setReviewError(result.error);
      }
      if (result.review) {
        setReviewResult(result.review);
      }
    });
  };

  const handlePostToGitHub = (reviewId: string) => {
    startPostTransition(async () => {
      try {
        const res = await fetch(`/api/code-reviews/${reviewId}/post`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Failed to post review' }));
          setReviewError(body.error ?? 'Failed to post review to GitHub');
          return;
        }
        const posted = await res.json();
        setReviewResult(posted);
      } catch (err) {
        setReviewError(err instanceof Error ? err.message : 'Failed to post review');
      }
    });
  };

  return (
    <div data-testid="feature-drawer-status" className="pb-4">
      {/* ── Progress ── */}

      {!isCompleted && data.progress > 0 ? (
        <div data-testid="feature-drawer-progress" className="px-3 pb-2">
          <div className="bg-foreground/[0.06] h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full transition-all', config.progressClass)}
              style={{ width: `${data.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* ── Description (above stats) ── */}
      {data.oneLiner || data.userQuery || showSummary ? (
        <Section icon={Info} title="Description">
          <Card className="flex flex-col gap-2">
            {data.oneLiner ? <KV label="One-Liner">{data.oneLiner}</KV> : null}
            {data.userQuery ? (
              <KV label="Query">
                <InlineAttachments text={data.userQuery} />
              </KV>
            ) : null}
            {showSummary ? (
              <KV label="Summary">
                <span className="leading-snug">{data.summary}</span>
              </KV>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {/* ── PR (right after description) ── */}
      {data.pr ? (
        <Section icon={GitCommitHorizontal} title="Pull Request">
          <Card>
            <div className="flex items-center gap-2">
              <a
                href={data.pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                #{data.pr.number} <ExternalLink className="size-3" />
              </a>
              <span className={cn('text-xs font-semibold', prColor[data.pr.status])}>
                {data.pr.status}
              </span>
              {data.pr.mergeable === false ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="size-3 shrink-0" /> Conflicts
                </span>
              ) : null}
              {data.pr.ciStatus && data.hideCiStatus !== true ? (
                <CiStatusBadge status={data.pr.ciStatus} />
              ) : null}
              {showReviewButton ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="ml-auto"
                  onClick={handleTriggerReview}
                  disabled={isReviewing}
                >
                  {isReviewing ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="mr-1 h-3 w-3" />
                  )}
                  {isReviewing ? 'Reviewing...' : 'Review PR'}
                </Button>
              ) : null}
              {!showReviewButton && data.pr.commitHash ? (
                <code className="text-foreground/40 ml-auto font-mono text-[11px]">
                  {data.pr.commitHash.slice(0, 7)}
                </code>
              ) : null}
            </div>
          </Card>
          {/* Code review results */}
          {reviewResult || reviewError || isReviewing ? (
            <div className="mt-2">
              <CodeReviewPanel
                review={reviewResult ?? undefined}
                loading={isReviewing}
                error={reviewError ?? undefined}
                onPostToGitHub={handlePostToGitHub}
                postingInProgress={isPosting}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* ── Quick stats grid ── */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-1">
        {data.branch ? (
          <Card>
            <KV label="Branch">
              <span className="inline-flex items-center gap-1">
                <GitBranch className="text-foreground/30 size-3 shrink-0" />
                <code className="font-mono text-[11px]">{data.branch}</code>
              </span>
              {data.baseBranch ? (
                <span className="text-foreground/30 block text-[10px]">from {data.baseBranch}</span>
              ) : null}
            </KV>
          </Card>
        ) : null}
        {data.agentType || data.modelId ? (
          <Card>
            <KV label="Agent">
              <span className="inline-flex items-center gap-1.5">
                {data.agentType
                  ? (() => {
                      const I = getAgentTypeIcon(data.agentType);
                      return <I className="size-3.5 shrink-0 opacity-50" />;
                    })()
                  : null}
                {data.agentType ? (
                  <span>
                    {agentTypeLabels[data.agentType as keyof typeof agentTypeLabels] ??
                      data.agentType}
                  </span>
                ) : null}
                {data.agentType && data.modelId ? (
                  <span className="text-foreground/20">/</span>
                ) : null}
                {data.modelId ? (
                  <span className="text-foreground/50 text-[12px]">
                    {getModelMeta(data.modelId).displayName || data.modelId}
                  </span>
                ) : null}
              </span>
            </KV>
          </Card>
        ) : null}
        {data.createdAt ? (
          <Card>
            <KV label="Created">
              <span className="inline-flex items-center gap-1">
                <Clock className="text-foreground/30 size-3 shrink-0" />
                {formatRelativeTime(data.createdAt)}
              </span>
            </KV>
          </Card>
        ) : null}
        {data.fastMode ? (
          <Card>
            <KV label="Mode">
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Zap className="size-3.5" /> Fast
              </span>
            </KV>
          </Card>
        ) : null}
        {data.runtime || elapsedTime ? (
          <Card>
            <KV label={data.runtime ? 'Runtime' : 'Elapsed'}>
              <span className="inline-flex items-center gap-1">
                <Clock className="text-foreground/30 size-3 shrink-0" />
                {data.runtime ?? elapsedTime}
              </span>
            </KV>
          </Card>
        ) : null}
      </div>

      {/* ── Errors ── */}
      {data.blockedBy || data.errorMessage ? (
        <Section icon={AlertTriangle} title="Issues">
          <Card className="border-destructive/20 bg-destructive/5">
            {data.blockedBy ? <KV label="Blocked By">{data.blockedBy}</KV> : null}
            {data.errorMessage ? (
              <KV label="Error">
                <span className="text-destructive">{data.errorMessage}</span>
              </KV>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {/* ── Sync ── */}
      {onRebaseOnMain && data.branch && onRefreshSync ? (
        <Section icon={RefreshCw} title="Branch Sync">
          <SyncCard
            syncStatus={syncStatus ?? null}
            syncLoading={syncLoading ?? false}
            syncError={syncError ?? null}
            onRefreshSync={onRefreshSync}
            onRebaseOnMain={onRebaseOnMain}
            rebaseLoading={rebaseLoading ?? false}
            rebaseError={rebaseError ?? null}
          />
        </Section>
      ) : null}

      {/* ── Settings ── */}
      <SettingsBlock data={data} pinnedConfig={pinnedConfig} />

      {/* ── Injected Skills ── */}
      {data.injectedSkills?.length ? <InjectedSkillsSection skills={data.injectedSkills} /> : null}
    </div>
  );
}

// ── Sync card ───────────────────────────────────────────────────────

function SyncCard({
  syncStatus,
  syncLoading,
  syncError,
  onRefreshSync,
  onRebaseOnMain,
  rebaseLoading,
  rebaseError,
}: {
  syncStatus: BranchSyncData | null;
  syncLoading: boolean;
  syncError: string | null;
  onRefreshSync: () => void;
  onRebaseOnMain: () => void;
  rebaseLoading: boolean;
  rebaseError: string | null;
}) {
  const { t } = useTranslation('web');
  const isBehind = syncStatus != null && syncStatus.behind > 0;
  const isUpToDate = syncStatus?.behind === 0;
  const base = syncStatus?.baseBranch ?? 'main';

  return (
    <Card>
      <div data-testid="branch-sync-status" className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[13px]">
          {syncLoading && !syncStatus ? (
            <>
              <CometSpinner size="sm" />
              <span className="text-foreground/40">Checking...</span>
            </>
          ) : syncError ? (
            <>
              <AlertTriangle className="size-3.5 text-red-500" />
              <span className="text-destructive text-xs">{syncError}</span>
            </>
          ) : rebaseLoading ? (
            <>
              <CometSpinner size="sm" />
              <span>
                Rebasing on <code className="font-mono text-[11px]">{base}</code>...
              </span>
            </>
          ) : isBehind ? (
            <>
              <AlertTriangle className="size-3.5 text-orange-500" />
              <span>
                {syncStatus.behind} behind <code className="font-mono text-[11px]">{base}</code>
                {syncStatus.ahead > 0 ? (
                  <span className="text-foreground/30 ml-1 text-[11px]">
                    · {syncStatus.ahead} ahead
                  </span>
                ) : null}
              </span>
            </>
          ) : isUpToDate ? (
            <>
              <CheckCircle2 className="size-3.5 text-green-500" />
              <span>
                Up to date · <code className="font-mono text-[11px]">{base}</code>
                {syncStatus.ahead > 0 ? (
                  <span className="text-foreground/30 ml-1 text-[11px]">
                    · {syncStatus.ahead} ahead
                  </span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>
        {(syncStatus || syncError) && !rebaseLoading ? (
          <button
            onClick={onRefreshSync}
            disabled={syncLoading}
            className="text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 inline-flex size-6 items-center justify-center rounded-sm disabled:opacity-50"
            aria-label={t('branchSyncStatus.refreshSyncStatus')}
          >
            <RefreshCw className={cn('size-3', syncLoading && 'animate-spin')} />
          </button>
        ) : null}
      </div>
      {isBehind && !rebaseLoading ? (
        <div className="pt-2">
          <ActionButton
            label={t('branchSyncStatus.rebaseOnMain')}
            onClick={onRebaseOnMain}
            loading={false}
            error={!!rebaseError}
            icon={GitMerge}
            variant="outline"
            size="sm"
          />
        </div>
      ) : null}
      {rebaseError ? <p className="text-destructive pt-1 text-[11px]">{rebaseError}</p> : null}
    </Card>
  );
}

// ── Settings ────────────────────────────────────────────────────────

function PinnedConfigCard({ pinnedConfig }: { pinnedConfig: FeatureDrawerPinnedConfig }) {
  const AgentIcon = getAgentTypeIcon(pinnedConfig.agentType);
  const modelName = pinnedConfig.modelId
    ? getModelMeta(pinnedConfig.modelId).displayName || pinnedConfig.modelId
    : 'No model selected';

  return (
    <Card data-testid="feature-pinned-config-card" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="text-foreground/40 flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
          <Settings className="size-3" /> Pinned Execution
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AgentIcon className="size-4 shrink-0 opacity-60" />
          <span className="font-medium">
            {agentTypeLabels[pinnedConfig.agentType as keyof typeof agentTypeLabels] ??
              pinnedConfig.agentType}
          </span>
          <span className="text-foreground/20">/</span>
          <span className="text-foreground/60">{modelName}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          Change the pinned agent and model before the next start, approval, or retry.
        </p>
      </div>

      <AgentModelPicker
        initialAgentType={pinnedConfig.agentType}
        initialModel={pinnedConfig.modelId}
        agentType={pinnedConfig.agentType}
        model={pinnedConfig.modelId}
        onSave={pinnedConfig.onSave}
        saveError={pinnedConfig.error}
        saving={pinnedConfig.saving}
        disabled={pinnedConfig.saving}
        mode="settings"
      />
    </Card>
  );
}

function SettingsBlock({
  data,
  pinnedConfig,
}: {
  data: FeatureNodeData;
  pinnedConfig?: FeatureDrawerPinnedConfig;
}) {
  const hasSettings =
    data.approvalGates != null ||
    data.push != null ||
    data.openPr != null ||
    data.ciWatchEnabled != null ||
    data.enableEvidence != null ||
    data.forkAndPr != null ||
    data.commitSpecs != null ||
    data.injectSkills != null;
  const showPinnedConfig = pinnedConfig != null && canSwitchPinnedConfig(data.state);

  if (!hasSettings && !showPinnedConfig) return null;

  return (
    <Section icon={Settings} title="Settings">
      <div className="flex flex-col gap-2">
        {showPinnedConfig ? <PinnedConfigCard pinnedConfig={pinnedConfig} /> : null}

        {hasSettings ? (
          <div className="grid grid-cols-3 gap-2">
            {data.approvalGates ? (
              <Card>
                <div className="text-foreground/40 mb-1.5 flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
                  <ShieldCheck className="size-3" /> Approve
                </div>
                <div className="flex flex-col gap-0.5">
                  <Flag on={data.approvalGates.allowPrd} label="PRD" />
                  <Flag on={data.approvalGates.allowPlan} label="Plan" />
                  <Flag on={data.approvalGates.allowMerge} label="Merge" />
                </div>
              </Card>
            ) : null}
            {data.enableEvidence != null ? (
              <Card>
                <div className="text-foreground/40 mb-1.5 flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
                  <FileSearch className="size-3" /> Evidence
                </div>
                <div className="flex flex-col gap-0.5">
                  <Flag on={data.enableEvidence} label="Collect" />
                  {data.commitEvidence != null ? (
                    <Flag on={data.commitEvidence} label="Add to PR" />
                  ) : null}
                </div>
              </Card>
            ) : null}
            {data.injectSkills != null ? (
              <Card>
                <div className="text-foreground/40 mb-1.5 flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
                  <Puzzle className="size-3" /> Skills
                </div>
                <div className="flex flex-col gap-0.5">
                  <Flag on={data.injectSkills} label="Inject" />
                </div>
              </Card>
            ) : null}
            {data.push != null ||
            data.openPr != null ||
            data.ciWatchEnabled != null ||
            data.commitSpecs != null ||
            data.forkAndPr != null ? (
              <Card>
                <div className="text-foreground/40 mb-1.5 flex items-center gap-1 text-[10px] font-medium tracking-wider uppercase">
                  <GitBranch className="size-3" /> Git
                </div>
                <div className="flex flex-col gap-0.5">
                  {data.push != null ? <Flag on={data.push} label="Push" /> : null}
                  {data.openPr != null ? <Flag on={data.openPr} label="PR" /> : null}
                  {data.ciWatchEnabled != null ? (
                    <Flag on={data.ciWatchEnabled} label="Watch" />
                  ) : null}
                  {data.commitSpecs != null ? <Flag on={data.commitSpecs} label="Specs" /> : null}
                  {data.forkAndPr != null ? <Flag on={data.forkAndPr} label="Fork" /> : null}
                </div>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

// ── Injected Skills ────────────────────────────────────────────────

function InjectedSkillsSection({ skills }: { skills: string[] }) {
  return (
    <Section icon={Puzzle} title="Feature Skills">
      <div className="flex flex-wrap gap-1.5">
        {skills.map((name) => (
          <Badge key={name} variant="secondary">
            {name}
          </Badge>
        ))}
      </div>
    </Section>
  );
}
