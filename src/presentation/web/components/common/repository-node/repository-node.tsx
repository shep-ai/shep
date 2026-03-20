'use client';

import { useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useRouter } from 'next/navigation';
import {
  Github,
  Plus,
  Code2,
  Terminal,
  FolderOpen,
  Trash2,
  Play,
  Square,
  GitBranch,
  GitCommitHorizontal,
  ArrowDown,
  User,
  RotateCcw,
  FileCode2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActionButton } from '@/components/common/action-button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import type { RepositoryNodeData } from './repository-node-config';
import { useRepositoryActions } from './use-repository-actions';
import { useCoastsActions } from './use-coasts-actions';
import {
  FeatureSessionsDropdown,
  type SessionSummary,
} from '@/components/common/feature-node/feature-sessions-dropdown';

export function RepositoryNode({
  data,
  selected,
}: {
  data: RepositoryNodeData;
  selected?: boolean;
  [key: string]: unknown;
}) {
  const router = useRouter();
  const featureFlags = useFeatureFlags();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const actions = useRepositoryActions(
    data.repositoryPath ? { repositoryId: data.id, repositoryPath: data.repositoryPath } : null
  );
  const deployAction = useDeployAction(
    data.repositoryPath
      ? {
          targetId: data.repositoryPath,
          targetType: 'repository',
          repositoryPath: data.repositoryPath,
        }
      : null
  );
  const coastsActions = useCoastsActions(
    data.repositoryPath ? { repositoryPath: data.repositoryPath } : null
  );
  const isDeploymentActive = deployAction.status === 'Booting' || deployAction.status === 'Ready';

  const handleCreateFromSession = useCallback(
    (session: SessionSummary, sessionFilePath: string) => {
      if (!data.repositoryPath) return;
      const preview = session.preview ? session.preview.slice(0, 200) : 'Unknown conversation';
      const prompt = [
        `Continue work from a previous agent session.`,
        ``,
        `## Session Context`,
        `- Session ID: ${session.id}`,
        `- Messages: ${session.messageCount}`,
        session.lastMessageAt ? `- Last active: ${session.lastMessageAt}` : '',
        `- Conversation file: ${sessionFilePath}`,
        ``,
        `## Session Preview`,
        `> ${preview}`,
        ``,
        `## Instructions`,
        `1. Read the full conversation history from the file above`,
        `2. Analyze the current state of the repository — what was done, what remains`,
        `3. Create or update spec files to accurately reflect the current state and remaining work`,
        `4. Continue implementing any unfinished work from the conversation`,
      ]
        .filter(Boolean)
        .join('\n');

      const params = new URLSearchParams({
        repo: data.repositoryPath,
        prompt,
      });
      router.push(`/create?${params.toString()}`);
    },
    [data.repositoryPath, router]
  );

  return (
    <div className={cn('group relative', data.onDelete && data.id && 'pl-10')}>
      {data.showHandles ? (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="opacity-0!"
          style={{ top: 70 }}
        />
      ) : null}

      {/* Delete button — visible on hover, positioned to the left */}
      {data.onDelete && data.id ? (
        <>
          <div className="absolute top-1/2 left-0 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Remove repository"
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
                <TooltipContent>Remove repository</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>Remove repository?</DialogTitle>
                <DialogDescription>
                  This will remove <strong>{data.name}</strong> and all its features from your
                  workspace. The repository files on disk won&apos;t be affected.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmOpen(false);
                    data.onDelete?.(data.id!);
                  }}
                >
                  Remove
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              (data.repositoryPath ?? data.onAdd) && 'ml-auto'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {data.repositoryPath ? (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <ActionButton
                          label="Open in IDE"
                          onClick={actions.openInIde}
                          loading={actions.ideLoading}
                          error={!!actions.ideError}
                          icon={Code2}
                          iconOnly
                          variant="ghost"
                          size="icon-xs"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Open in IDE</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <ActionButton
                          label="Open in Shell"
                          onClick={actions.openInShell}
                          loading={actions.shellLoading}
                          error={!!actions.shellError}
                          icon={Terminal}
                          iconOnly
                          variant="ghost"
                          size="icon-xs"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Open in Shell</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center">
                        <ActionButton
                          label="Open Folder"
                          onClick={actions.openFolder}
                          loading={actions.folderLoading}
                          error={!!actions.folderError}
                          icon={FolderOpen}
                          iconOnly
                          variant="ghost"
                          size="icon-xs"
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Open Folder</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <FeatureSessionsDropdown
                  repositoryPath={data.repositoryPath}
                  includeWorktrees
                  onCreateFromSession={handleCreateFromSession}
                />
              </>
            ) : null}

            {data.onAdd ? <div className="ml-1.5" /> : null}
            {data.onAdd ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="New feature"
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
                      <span className="translate-y-px">New</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">New feature</TooltipContent>
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
                    {data.behindCount} behind
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
                      className="text-muted-foreground/70 ml-auto flex shrink-0 items-center gap-1"
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
                <span>Not a git repository</span>
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

        {/* Row 4: Local dev server — always visible when envDeploy flag is on */}
        {featureFlags.envDeploy && data.repositoryPath ? (
          <div
            data-testid="repository-node-dev-preview"
            className="border-border/50 border-t px-4 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-xs">
              {deployAction.deployError ? (
                <span className="truncate text-xs text-red-500">{deployAction.deployError}</span>
              ) : isDeploymentActive ? (
                <>
                  <span className="mr-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-green-500" />
                  {deployAction.url ? (
                    <a
                      href={deployAction.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-green-700 hover:underline dark:text-green-400"
                    >
                      {deployAction.url}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Starting...</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Run
                  <span className="text-muted-foreground/50 ml-2 text-[10px]">
                    start local environment
                  </span>
                </span>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        'ml-auto flex items-center',
                        !isDeploymentActive &&
                          !deployAction.deployError &&
                          '[&_button]:text-green-600 [&_button]:hover:text-green-700 dark:[&_button]:text-green-400 dark:[&_button]:hover:text-green-300'
                      )}
                    >
                      <ActionButton
                        label={
                          deployAction.deployError
                            ? 'Retry'
                            : isDeploymentActive
                              ? 'Stop Dev Server'
                              : 'Start Dev Server'
                        }
                        onClick={isDeploymentActive ? deployAction.stop : deployAction.deploy}
                        loading={deployAction.deployLoading || deployAction.stopLoading}
                        error={false}
                        icon={
                          deployAction.deployError ? RotateCcw : isDeploymentActive ? Square : Play
                        }
                        iconOnly
                        variant="ghost"
                        size="icon-xs"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isDeploymentActive ? 'Stop Dev Server' : 'Start Dev Server'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        ) : null}

        {/* Row 5: Coastfile generation — visible when coastsDevServer flag is on */}
        {featureFlags.coastsDevServer && data.repositoryPath ? (
          <div
            data-testid="repository-node-coastfile"
            className="border-t px-4 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">
                {coastsActions.coastfileExists ? 'Coastfile' : 'No Coastfile'}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-auto flex items-center">
                      <ActionButton
                        label={
                          coastsActions.coastfileExists
                            ? 'Regenerate Coastfile'
                            : 'Generate Coastfile'
                        }
                        onClick={coastsActions.generateCoastfile}
                        loading={coastsActions.generating || coastsActions.checkLoading}
                        error={!!coastsActions.error}
                        icon={FileCode2}
                        iconOnly
                        variant="ghost"
                        size="icon-xs"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {coastsActions.error ??
                      (coastsActions.coastfileExists
                        ? 'Regenerate Coastfile'
                        : 'Generate Coastfile')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        ) : null}
      </div>

      {/* Source handle — invisible, for edge connections */}
      {data.onAdd || data.showHandles ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={!data.showHandles}
          className="opacity-0!"
          style={{ top: 70 }}
        />
      ) : null}
    </div>
  );
}
