'use client';

import { useQuery } from '@tanstack/react-query';
import { FilePen, FilePlus, GitBranch } from 'lucide-react';

import { getGitRepoInfo } from '@/app/actions/get-git-log';

export interface GitStatusClusterProps {
  applicationId: string;
  repositoryPath: string;
}

/**
 * Always-visible inline indicator next to the repo path: branch name + a
 * small "n added · n edited · ±lines" digest of working-tree drift. Lives
 * here so the user can see at a glance whether their app has uncommitted
 * work without needing to open the SmartDeployButton panel.
 *
 * The Commit / Commit & Push buttons that used to live in this cluster
 * have been removed — that's the SmartDeployButton's job now (Save 3
 * changes / Save & publish), and having two parallel paths to commit
 * was confusing for the non-technical target audience. The cluster is
 * pure read-only display of git state.
 */
export function GitStatusCluster({
  applicationId: _applicationId,
  repositoryPath,
}: GitStatusClusterProps) {
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
    </div>
  );
}
