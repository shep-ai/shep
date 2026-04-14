'use client';

import { useCallback, useState } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePen, FilePlus, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

import { getGitRepoInfo } from '@/app/actions/get-git-log';
import { commitApplicationChanges } from '@/app/actions/applications/commit-application-changes';
import { commitAndPushApplicationChanges } from '@/app/actions/applications/commit-and-push-application-changes';

export interface GitStatusClusterProps {
  applicationId: string;
  repositoryPath: string;
}

/**
 * Polls git repo info for current branch + working-tree diff numbers.
 * Rendered inline next to the repo path so users can see at a glance
 * which branch the application repo is on and how many files have
 * been added or edited since the last commit. Also exposes the Commit
 * and Commit & Push controls wired to use cases in the core layer.
 */
export function GitStatusCluster({ applicationId, repositoryPath }: GitStatusClusterProps) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['git-repo-info', repositoryPath],
    queryFn: () => getGitRepoInfo(repositoryPath, 1),
    enabled: Boolean(repositoryPath),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });

  const trimmedBranch = data?.currentBranch?.trim();
  const branch = trimmedBranch && trimmedBranch.length > 0 ? trimmedBranch : 'main';
  const added = data?.workingTree.untracked ?? 0;
  const edited = data?.workingTree.modified ?? 0;
  const insertions = data?.diffStats?.insertions ?? 0;
  const deletions = data?.diffStats?.deletions ?? 0;
  const hasChanges = added > 0 || edited > 0;

  const [commitBusy, setCommitBusy] = useState(false);
  const [commitPushBusy, setCommitPushBusy] = useState(false);

  const buildMessage = useCallback((): string => {
    const parts: string[] = [];
    if (edited > 0) parts.push(`${edited} edited`);
    if (added > 0) parts.push(`${added} added`);
    const summary = parts.length > 0 ? parts.join(', ') : 'working tree changes';
    return `chore: update application (${summary})`;
  }, [added, edited]);

  const handleCommit = useCallback(async () => {
    if (commitBusy) return;
    setCommitBusy(true);
    try {
      const result = await commitApplicationChanges({
        applicationId,
        message: buildMessage(),
      });
      if (result.error) {
        toast.error('Commit failed', { description: result.error });
        return;
      }
      toast.success('Committed changes', {
        description: result.committed
          ? `${edited} edited / ${added} added on ${branch}`
          : 'Nothing to commit',
      });
      await queryClient.invalidateQueries({ queryKey: ['git-repo-info', repositoryPath] });
    } catch (err) {
      toast.error('Commit failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCommitBusy(false);
    }
  }, [added, applicationId, branch, buildMessage, commitBusy, edited, queryClient, repositoryPath]);

  const handleCommitPush = useCallback(async () => {
    if (commitPushBusy) return;
    setCommitPushBusy(true);
    try {
      const result = await commitAndPushApplicationChanges({
        applicationId,
        message: buildMessage(),
      });
      if (result.error) {
        toast.error('Commit & push failed', { description: result.error });
        return;
      }
      toast.success('Committed and pushed', {
        description: result.pushed
          ? `${edited} edited / ${added} added on ${branch}`
          : 'Nothing to push',
      });
      await queryClient.invalidateQueries({ queryKey: ['git-repo-info', repositoryPath] });
    } catch (err) {
      toast.error('Commit & push failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setCommitPushBusy(false);
    }
  }, [
    added,
    applicationId,
    branch,
    buildMessage,
    commitPushBusy,
    edited,
    queryClient,
    repositoryPath,
  ]);

  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="flex items-center gap-1" title={`Branch: ${branch}`}>
        <GitBranch className="h-3 w-3" />
        {branch}
      </span>
      {added > 0 ? (
        <span
          className="flex items-center gap-0.5 text-emerald-500"
          title={`${added} added ${added === 1 ? 'file' : 'files'}`}
        >
          <FilePlus className="h-3 w-3" />
          {added}
        </span>
      ) : null}
      {edited > 0 ? (
        <span
          className="flex items-center gap-0.5 text-amber-500"
          title={`${edited} edited ${edited === 1 ? 'file' : 'files'}`}
        >
          <FilePen className="h-3 w-3" />
          {edited}
        </span>
      ) : null}
      {insertions > 0 || deletions > 0 ? (
        <span
          className="flex items-center gap-1"
          title={`${insertions} insertions, ${deletions} deletions vs HEAD`}
        >
          {insertions > 0 ? <span className="text-emerald-500">+{insertions}</span> : null}
          {deletions > 0 ? <span className="text-rose-500">-{deletions}</span> : null}
        </span>
      ) : null}
      {hasChanges ? (
        <>
          <button
            type="button"
            onClick={handleCommit}
            disabled={commitBusy}
            className="border-border bg-background text-foreground hover:bg-muted inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-50"
            title="Commit working tree changes"
          >
            {commitBusy ? 'Committing…' : 'Commit'}
          </button>
          <button
            type="button"
            onClick={handleCommitPush}
            disabled={commitPushBusy}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-400"
            title="Commit and push to remote"
          >
            {commitPushBusy ? 'Pushing…' : 'Commit & Push'}
          </button>
        </>
      ) : null}
    </div>
  );
}
