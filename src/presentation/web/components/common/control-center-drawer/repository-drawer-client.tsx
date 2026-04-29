'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Code2,
  Terminal,
  FolderOpen,
  RefreshCw,
  Play,
  Square,
  Copy,
  Check,
  Loader2,
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  GitCommitHorizontal,
  AlertTriangle,
  Globe,
  Tag,
  Archive,
  FileEdit,
  FilePlus,
  FileCheck2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BaseDrawer } from '@/components/common/base-drawer';
import { DeploymentStatusBadge } from '@/components/common/deployment-status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useRepositoryActions } from '@/components/common/repository-node/use-repository-actions';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import { ChatTab } from '@/components/features/chat/ChatTab';
import { getGitRepoInfo } from '@/app/actions/get-git-log';
import type { GitRepoInfo } from '@/app/actions/get-git-log';

const COPY_FEEDBACK_DELAY = 2000;

const tbBtn =
  'text-muted-foreground hover:bg-foreground/8 hover:text-foreground inline-flex size-8 items-center justify-center rounded-[3px] disabled:opacity-40';
const tbSep = 'bg-border/60 mx-1.5 h-5 w-px shrink-0';

export interface RepositoryDrawerClientProps {
  data: RepositoryNodeData;
  /** Initial tab key from URL (e.g. 'chat'). */
  initialTab?: 'overview' | 'chat';
}

export function RepositoryDrawerClient({ data, initialTab }: RepositoryDrawerClientProps) {
  const featureFlags = useFeatureFlags();
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = pathname.startsWith('/repository/');
  const [activeTab, setActiveTab] = useState<string>(initialTab ?? 'overview');
  const [pathCopied, setPathCopied] = useState(false);
  const repoActions = useRepositoryActions(
    data.repositoryPath ? { repositoryId: data.id, repositoryPath: data.repositoryPath } : null
  );

  const onClose = useCallback(() => {
    router.push('/control-center');
  }, [router]);

  const deployAction = useDeployAction(
    data.repositoryPath
      ? {
          targetId: data.repositoryPath,
          targetType: 'repository' as const,
          repositoryPath: data.repositoryPath,
        }
      : null
  );
  const isDeployActive = deployAction.status === 'Booting' || deployAction.status === 'Ready';

  const handleCopyPath = useCallback(() => {
    if (!data.repositoryPath) return;
    void navigator.clipboard.writeText(data.repositoryPath);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), COPY_FEEDBACK_DELAY);
  }, [data.repositoryPath]);

  // Session ID for repo chat — deterministic per repo
  const repoSessionId = data.id ? `repo-${data.id}` : `repo-${data.name}`;

  return (
    <BaseDrawer
      open={isOpen}
      onClose={onClose}
      size="lg"
      modal={false}
      data-testid="repository-drawer"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        {/* VS Code-style tab bar */}
        <TabsList className="bg-muted/50 h-auto w-full shrink-0 justify-start gap-0 rounded-none border-b p-0">
          <TabsTrigger
            value="overview"
            className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-t-primary [&:not([data-state=active])]:border-r-border relative h-auto rounded-none border-t-2 border-r border-t-transparent border-r-transparent bg-transparent px-3.5 py-2.5 text-[13px] font-normal shadow-none transition-none last:border-r-transparent data-[state=active]:shadow-none"
          >
            <LayoutDashboard className="mr-1.5 size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-t-primary [&:not([data-state=active])]:border-r-border relative h-auto rounded-none border-t-2 border-r border-t-transparent border-r-transparent bg-transparent px-3.5 py-2.5 text-[13px] font-normal shadow-none transition-none last:border-r-transparent data-[state=active]:shadow-none"
          >
            <MessageSquare className="mr-1.5 size-4" />
            Chat
          </TabsTrigger>
        </TabsList>

        {/* Persistent header — contrasting background */}
        <div className="bg-muted/40 shrink-0 border-b">
          {/* Repo title + path breadcrumb */}
          <div
            className="flex items-center gap-2 px-4 pe-10 pt-2.5 pb-2"
            data-testid="repository-drawer-header"
          >
            <h2 className="text-foreground min-w-0 truncate text-base font-semibold tracking-tight">
              {data.name}
            </h2>
            {data.repositoryPath ? (
              <>
                <span className="text-muted-foreground/40 text-xs">/</span>
                <span className="text-muted-foreground min-w-0 truncate font-mono text-[11px]">
                  {data.repositoryPath}
                </span>
              </>
            ) : null}
          </div>

          {/* IDE toolbar */}
          {data.repositoryPath ? (
            <div data-testid="repository-drawer-toolbar">
              <div className="flex h-9 items-center px-1.5">
                {/* Left: Open actions */}
                <TooltipProvider delayDuration={300}>
                  <div className="flex items-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={tbBtn}
                          onClick={repoActions.openInIde}
                          disabled={repoActions.ideLoading}
                          aria-label="Open in IDE"
                        >
                          {repoActions.ideLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Code2 className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Open in IDE
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={tbBtn}
                          onClick={repoActions.openInShell}
                          disabled={repoActions.shellLoading}
                          aria-label="Open terminal"
                        >
                          {repoActions.shellLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Terminal className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Open terminal
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={tbBtn}
                          onClick={repoActions.openFolder}
                          disabled={repoActions.folderLoading}
                          aria-label="Open folder"
                        >
                          {repoActions.folderLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <FolderOpen className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Open folder
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={tbBtn}
                          onClick={handleCopyPath}
                          aria-label="Copy path"
                        >
                          {pathCopied ? (
                            <Check className="size-3.5 text-green-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {pathCopied ? 'Copied!' : 'Copy path'}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Git sync */}
                  {data.id ? (
                    <>
                      <div className={tbSep} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className={tbBtn}
                            onClick={repoActions.syncMain}
                            disabled={repoActions.syncLoading}
                            aria-label="Sync main"
                          >
                            {repoActions.syncLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Sync main
                        </TooltipContent>
                      </Tooltip>
                    </>
                  ) : null}

                  {/* Deploy */}
                  {featureFlags.envDeploy ? (
                    <>
                      <div className={tbSep} />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={deployAction.deployLoading || deployAction.stopLoading}
                            onClick={isDeployActive ? deployAction.stop : deployAction.deploy}
                            className={cn(
                              'inline-flex size-7 items-center justify-center rounded-[3px] disabled:opacity-40',
                              isDeployActive
                                ? 'text-red-500 hover:bg-red-500/10 hover:text-red-400'
                                : 'text-green-500 hover:bg-green-500/10 hover:text-green-400'
                            )}
                            aria-label={isDeployActive ? 'Stop dev server' : 'Start dev server'}
                          >
                            {deployAction.deployLoading || deployAction.stopLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : isDeployActive ? (
                              <Square className="size-4" />
                            ) : (
                              <Play className="size-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {isDeployActive ? 'Stop dev server' : 'Start dev server'}
                        </TooltipContent>
                      </Tooltip>
                      {isDeployActive ? (
                        <DeploymentStatusBadge
                          status={deployAction.status}
                          url={deployAction.url}
                          targetId={data.repositoryPath}
                        />
                      ) : null}
                    </>
                  ) : null}
                </TooltipProvider>

                <div className="flex-1" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-0 flex-1 overflow-y-auto">
          <RepoOverview data={data} syncError={repoActions.syncError} />
        </TabsContent>

        {/* Chat tab */}
        <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ChatTab featureId={repoSessionId} worktreePath={data.repositoryPath} />
        </TabsContent>
      </Tabs>
    </BaseDrawer>
  );
}

// ── Repo Overview ───────────────────────────────────────────────────

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

function RepoOverview({
  data,
  syncError,
}: {
  data: RepositoryNodeData;
  syncError?: string | null;
}) {
  const [repoInfo, setRepoInfo] = useState<GitRepoInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!data.repositoryPath) return;
    let cancelled = false;
    setLoading(true);
    getGitRepoInfo(data.repositoryPath, 8)
      .then((result) => {
        if (!cancelled) setRepoInfo(result);
      })
      .catch(() => {
        // Silently handle — repo info is non-critical
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.repositoryPath]);

  if (!data.repositoryPath) return null;

  const wt = repoInfo?.workingTree;
  const isDirty = wt && (wt.staged > 0 || wt.modified > 0 || wt.untracked > 0);
  const ds = repoInfo?.diffStats;

  return (
    <div className="pb-4">
      {loading ? (
        <div className="text-foreground/40 flex items-center gap-2 px-4 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading repository info...
        </div>
      ) : null}

      {/* Quick stats grid */}
      {repoInfo ? (
        <div className="grid grid-cols-2 gap-2 px-3 pt-3">
          {/* Current branch */}
          <Card>
            <KV label="Branch">
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="text-foreground/30 size-3.5 shrink-0" />
                <code className="font-mono text-sm">
                  {repoInfo.currentBranch ?? data.branch ?? '—'}
                </code>
              </span>
              {data.behindCount != null && data.behindCount > 0 ? (
                <span className="mt-0.5 block text-xs text-orange-600 dark:text-orange-400">
                  {data.behindCount} behind default
                </span>
              ) : null}
            </KV>
          </Card>

          {/* Working tree */}
          <Card>
            <KV label="Working Tree">
              {isDirty ? (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {wt.staged > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <FileCheck2 className="size-3.5" /> {wt.staged} staged
                    </span>
                  ) : null}
                  {wt.modified > 0 ? (
                    <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                      <FileEdit className="size-3.5" /> {wt.modified} modified
                    </span>
                  ) : null}
                  {wt.untracked > 0 ? (
                    <span className="text-foreground/50 inline-flex items-center gap-1 text-sm">
                      <FilePlus className="size-3.5" /> {wt.untracked} untracked
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <Check className="size-3.5" /> Clean
                </span>
              )}
            </KV>
          </Card>

          {/* Diff stats */}
          {ds ? (
            <Card>
              <KV label="Uncommitted Changes">
                <div className="flex items-center gap-3 text-sm">
                  <span>
                    {ds.filesChanged} file{ds.filesChanged !== 1 ? 's' : ''}
                  </span>
                  <span className="text-green-600 dark:text-green-400">+{ds.insertions}</span>
                  <span className="text-red-500 dark:text-red-400">-{ds.deletions}</span>
                </div>
              </KV>
            </Card>
          ) : null}

          {/* Remotes */}
          {repoInfo.remotes.length > 0 ? (
            <Card>
              <KV label="Remote">
                {repoInfo.remotes.map((r) => (
                  <span key={r.name} className="inline-flex items-center gap-1.5 text-sm">
                    <Globe className="text-foreground/30 size-3.5 shrink-0" />
                    <span className="truncate">
                      {r.url
                        .replace(/\.git$/, '')
                        .replace(/^https?:\/\/([^@]+@)?/, '')
                        .replace(/x-access-token:[^@]+@/, '')}
                    </span>
                  </span>
                ))}
              </KV>
            </Card>
          ) : null}

          {/* Stashes */}
          {repoInfo.stashCount > 0 ? (
            <Card>
              <KV label="Stashes">
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <Archive className="text-foreground/30 size-3.5 shrink-0" />
                  {repoInfo.stashCount} stash{repoInfo.stashCount !== 1 ? 'es' : ''}
                </span>
              </KV>
            </Card>
          ) : null}

          {/* Tags */}
          {repoInfo.tags.length > 0 ? (
            <Card>
              <KV label="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {repoInfo.tags.map((t) => (
                    <span
                      key={t}
                      className="bg-foreground/[0.04] inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs"
                    >
                      <Tag className="text-foreground/30 size-2.5" />
                      {t}
                    </span>
                  ))}
                </div>
              </KV>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Commit history */}
      {repoInfo && repoInfo.commits.length > 0 ? (
        <Section icon={GitCommitHorizontal} title="Recent Commits">
          <div className="relative ml-3">
            <div className="bg-border absolute top-2 bottom-2 left-[5px] w-px" />
            {repoInfo.commits.map((c, i) => (
              <div key={c.hash} className="group relative flex gap-3 py-1.5">
                <div
                  className={cn(
                    'relative z-10 mt-1.5 size-[11px] shrink-0 rounded-full border-2',
                    i === 0
                      ? 'border-primary bg-primary'
                      : 'border-border bg-background group-hover:border-foreground/30'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 truncate text-sm leading-snug">{c.subject}</p>
                    <code className="text-foreground/30 shrink-0 font-mono text-[11px]">
                      {c.shortHash}
                    </code>
                  </div>
                  <div className="text-foreground/40 mt-0.5 flex items-center gap-2 text-xs">
                    <span>{c.author}</span>
                    <span>·</span>
                    <span>{c.relativeDate}</span>
                    {c.branch ? (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <GitBranch className="size-3" />
                          {c.branch}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Branches — below commits, main/master first */}
      {repoInfo && repoInfo.branches.length > 1 ? (
        <Section icon={GitBranch} title="Branches">
          <div className="flex flex-col">
            {[...repoInfo.branches]
              .sort((a, b) => {
                const isDefault = (n: string) => /^(main|master)$/.test(n);
                if (a.isCurrent && !b.isCurrent) return -1;
                if (!a.isCurrent && b.isCurrent) return 1;
                if (isDefault(a.name) && !isDefault(b.name)) return -1;
                if (!isDefault(a.name) && isDefault(b.name)) return 1;
                return 0;
              })
              .map((b) => (
                <div
                  key={b.name}
                  className={cn(
                    'flex items-center justify-between rounded px-2 py-1.5',
                    b.isCurrent && 'bg-muted/60'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    {b.isCurrent ? (
                      <span className="size-2 shrink-0 rounded-full bg-green-500" />
                    ) : /^(main|master)$/.test(b.name) ? (
                      <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                    ) : (
                      <span className="bg-foreground/10 size-2 shrink-0 rounded-full" />
                    )}
                    <code className="font-mono text-[13px]">{b.name}</code>
                    {b.isCurrent ? (
                      <span className="text-foreground/40 text-[10px]">current</span>
                    ) : null}
                  </span>
                  <span className="text-foreground/40 text-xs">{b.lastCommitDate}</span>
                </div>
              ))}
          </div>
        </Section>
      ) : null}

      {/* Errors */}
      {syncError ? (
        <Section icon={AlertTriangle} title="Issues">
          <Card className="bg-destructive/5 border-transparent">
            <p className="text-destructive text-sm">{syncError}</p>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
