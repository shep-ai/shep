'use client';

import { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useRouter } from 'next/navigation';
import {
  Github,
  Plus,
  FolderOpen,
  Trash2,
  GitBranch,
  GitCommitHorizontal,
  ArrowDown,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ActionButton } from '@/components/common/action-button';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { RepositoryNodeData } from './repository-node-config';
import {
  RepositoryActionKey,
  RepositoryActionTone,
  REPOSITORY_TOOLBAR_ACTION_KEYS,
  type RepositoryAction,
} from './repository-actions';
import { useRepositoryCardActions } from './use-repository-card-actions';
import { RepositoryDeleteDialog } from './repository-delete-dialog';
import { ChatDotIndicator } from '@/components/features/chat/ChatDotIndicator';
import { FeatureSessionsDropdown } from '@/components/common/feature-node/feature-sessions-dropdown';

/** Vertical offset of the edge handles, aligned with the card's first row. */
const HANDLE_TOP_PX = 70;

/** Icon-button tint per action tone. */
const TONE_CLASS: Partial<Record<RepositoryActionTone, string>> = {
  [RepositoryActionTone.Positive]:
    'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300',
  [RepositoryActionTone.Accent]:
    'text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300',
};

export function RepositoryNode({
  data,
  selected,
}: {
  data: RepositoryNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const { t, i18n } = useTranslation('web');
  const router = useRouter();
  const isRtl = i18n.dir() === 'rtl';
  const targetHandlePos = isRtl ? Position.Right : Position.Left;
  const sourceHandlePos = isRtl ? Position.Left : Position.Right;
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canDelete = Boolean(data.onDelete && data.id);

  const { byKey, deployment, chatTurnStatus } = useRepositoryCardActions({
    ...(data.id !== undefined && { repositoryId: data.id }),
    repositoryName: data.name,
    ...(data.repositoryPath !== undefined && { repositoryPath: data.repositoryPath }),
    // The card renders "+ New" as its own primary button, and delete as a
    // hover affordance outside the card, so both are placed by hand below.
    withoutNewFeature: true,
  });

  const devServer = byKey(RepositoryActionKey.DevServer);

  // Adoption itself happens in AdoptAgentSessionUseCase — this only navigates
  // to the feature it produced. No prompt is assembled here.
  const handleSessionAdopted = useCallback(
    (featureId: string) => {
      router.push(`/feature/${featureId}`);
    },
    [router]
  );

  return (
    <div
      className={cn('group relative', canDelete && 'ps-10')}
      style={{ direction: isRtl ? 'rtl' : 'ltr' }}
    >
      {data.showHandles ? (
        <Handle
          type="target"
          position={targetHandlePos}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: HANDLE_TOP_PX }}
        />
      ) : null}

      {/* Delete button — visible on hover, positioned to the left */}
      {canDelete ? (
        <>
          <div className="absolute -start-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label={t('repositoryNode.removeRepository')}
                    data-testid="repository-node-delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmOpen(true);
                    }}
                    className="bg-card text-muted-foreground hover:border-destructive hover:text-destructive flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('repositoryNode.removeRepository')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <RepositoryDeleteDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            repositoryName={data.name}
            onConfirm={({ deleteFromDisk }) => {
              setConfirmOpen(false);
              data.onDelete?.(data.id!, { deleteFromDisk });
            }}
          />
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        data-testid="repository-node-card"
        data-repo-name={data.name}
        onClick={(e) => {
          e.stopPropagation();
          data.onClick?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            data.onClick?.();
          }
        }}
        className={cn(
          'nodrag bg-card flex w-[26rem] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-sm transition-[border-color,box-shadow] duration-200 dark:bg-neutral-800/80',
          selected && 'border-blue-400 dark:border-amber-500/60'
        )}
      >
        {/* Row 1: Repository name + action buttons */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Github className="text-muted-foreground h-5 w-5 shrink-0" />
          <span data-testid="repository-node-name" className="min-w-0 truncate text-sm font-medium">
            {data.name}
          </span>

          <div
            className={cn(
              'flex shrink-0 items-center gap-2',
              (data.repositoryPath ?? data.onAdd) && 'ms-auto'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {data.repositoryPath ? (
              <>
                {REPOSITORY_TOOLBAR_ACTION_KEYS.map((key) => {
                  const action = byKey(key);
                  if (!action) return null;
                  return key === RepositoryActionKey.Chat ? (
                    <ChatActionButton key={key} action={action} turnStatus={chatTurnStatus} />
                  ) : (
                    <ToolbarActionButton key={key} action={action} />
                  );
                })}
                {/* Worktree inclusion is decided by the batch sessions use
                    case per path — repo paths already include them. */}
                <FeatureSessionsDropdown
                  repositoryPath={data.repositoryPath}
                  onAdopted={handleSessionAdopted}
                />
              </>
            ) : null}

            {data.onAdd ? <div className="ms-1.5" /> : null}
            {data.onAdd ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={t('repositoryNode.newFeature')}
                      data-testid="repository-node-add-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        data.onAdd?.();
                      }}
                      className={cn(
                        'flex h-6 shrink-0 cursor-pointer items-center gap-0.5 rounded bg-blue-500 px-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-600 dark:bg-amber-500 dark:hover:bg-amber-400',
                        data.pulseAdd && 'animate-pulse-cta'
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      <span className="translate-y-px">{t('repositoryNode.new')}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t('repositoryNode.newFeature')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>

        {/* Row 2 & 3: Git info or placeholder */}
        {data.branch ? (
          <>
            {/* Row 2: Branch + behind status */}
            <div
              data-testid="repository-node-git-info"
              className="text-muted-foreground border-border/50 border-t px-4 py-2"
            >
              <div className="flex items-center gap-3 text-xs">
                <span
                  className="flex items-center gap-1 truncate"
                  data-testid="repository-node-branch"
                >
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{data.branch}</span>
                </span>
                {data.behindCount != null && data.behindCount > 0 ? (
                  <span
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-amber-500"
                    data-testid="repository-node-behind"
                  >
                    <ArrowDown className="h-3 w-3 shrink-0" />
                    {t('repositoryNode.behind', { count: data.behindCount })}
                  </span>
                ) : null}
              </div>
            </div>
            {/* Row 3: Latest commit */}
            {data.commitMessage ? (
              <div
                data-testid="repository-node-commit-info"
                className="text-muted-foreground border-border/50 border-t px-4 py-2"
              >
                <div className="flex items-center gap-2 text-xs">
                  <GitCommitHorizontal className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate" data-testid="repository-node-commit-message">
                    {data.commitMessage}
                  </span>
                  {data.committer ? (
                    <span
                      className="text-muted-foreground/70 ms-auto flex shrink-0 items-center gap-1"
                      data-testid="repository-node-committer"
                    >
                      <User className="h-3 w-3 shrink-0" />
                      <span>{data.committer}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : data.gitInfoStatus === 'not-a-repo' ? (
          /* Not a git repo — two rows for consistency with loading/ready states */
          <>
            <div
              data-testid="repository-node-not-repo"
              className="text-muted-foreground border-border/50 border-t px-4 py-2"
            >
              <div className="flex items-center gap-2 text-xs">
                <FolderOpen className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate opacity-60">
                  {data.repositoryPath ?? 'Unknown path'}
                </span>
              </div>
            </div>
            <div className="text-muted-foreground border-border/50 border-t px-4 py-2">
              <div className="flex items-center gap-2 text-xs opacity-40">
                <GitBranch className="h-3 w-3 shrink-0" />
                <span>{t('repositoryNode.notAGitRepository')}</span>
              </div>
            </div>
          </>
        ) : data.gitInfoStatus !== 'ready' ? (
          /* Loading — show skeleton placeholders for both rows */
          <>
            <div
              data-testid="repository-node-git-loading"
              className="border-border/50 border-t px-4 py-2"
            >
              <div className="flex h-4 items-center gap-2 text-xs">
                <GitBranch className="text-muted-foreground h-3 w-3 shrink-0" />
                <span className="bg-muted h-3 w-20 animate-pulse rounded" />
              </div>
            </div>
            <div className="border-border/50 border-t px-4 py-2">
              <div className="flex h-4 items-center gap-2 text-xs">
                <GitCommitHorizontal className="text-muted-foreground h-3 w-3 shrink-0" />
                <span className="bg-muted h-3 w-36 animate-pulse rounded" />
              </div>
            </div>
          </>
        ) : null}

        {/* Row 4: Local dev server — present whenever the action is offered */}
        {devServer ? (
          <div
            data-testid="repository-node-dev-preview"
            className="border-border/50 border-t px-4 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-xs">
              {deployment.error ? (
                <span className="truncate text-xs text-red-500">{deployment.error}</span>
              ) : deployment.active ? (
                <>
                  <span className="me-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                  {deployment.url ? (
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-green-700 hover:underline dark:text-green-400"
                    >
                      {deployment.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{t('repositoryNode.starting')}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground inline-flex items-baseline gap-2">
                  <span>{t('repositoryNode.run')}</span>
                  <span className="text-muted-foreground/50 text-[10px]">
                    {t('repositoryNode.startLocalEnvironment')}
                  </span>
                </span>
              )}
              <span className="ms-auto flex items-center">
                <ToolbarActionButton action={devServer} />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Source handle — invisible, for edge connections */}
      {data.onAdd || data.showHandles ? (
        <Handle
          type="source"
          position={sourceHandlePos}
          isConnectable={!data.showHandles}
          className="opacity-0!"
          style={{ top: HANDLE_TOP_PX }}
        />
      ) : null}
    </div>
  );
}

/** One shared action rendered as a tooltipped icon button. */
function ToolbarActionButton({ action }: { action: RepositoryAction }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center">
            <ActionButton
              label={action.label}
              onClick={action.run}
              loading={action.loading}
              error={action.error}
              icon={action.icon}
              iconOnly
              variant="ghost"
              size="icon-xs"
              disabled={action.disabled}
              {...(!action.error && { className: TONE_CLASS[action.tone] })}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{action.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Chat gets its own button because it carries the agent turn indicator — a
 * decoration no other action has.
 */
function ChatActionButton({
  action,
  turnStatus,
}: {
  action: RepositoryAction;
  turnStatus: Parameters<typeof ChatDotIndicator>[0]['status'];
}) {
  const Icon = action.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={action.label}
            onClick={(e) => {
              e.stopPropagation();
              action.run();
            }}
            className={cn(
              'nodrag relative cursor-pointer',
              TONE_CLASS[RepositoryActionTone.Accent]
            )}
          >
            <Icon className="h-3 w-3" />
            <ChatDotIndicator status={turnStatus} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{action.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
