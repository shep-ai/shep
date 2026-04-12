export interface GitLogEntry {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  relativeDate: string;
  branch?: string;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  lastCommitDate: string;
}

export interface GitRemoteInfo {
  name: string;
  url: string;
}

export interface GitWorkingTreeStatus {
  staged: number;
  modified: number;
  untracked: number;
}

export interface GitDiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitRepoInfo {
  commits: GitLogEntry[];
  branches: GitBranchInfo[];
  remotes: GitRemoteInfo[];
  tags: string[];
  stashCount: number;
  currentBranch: string;
  diffStats: GitDiffStats | null;
  workingTree: GitWorkingTreeStatus;
  error?: string;
}

export async function getGitLog(_repositoryPath: string, _limit = 8): Promise<GitLogEntry[]> {
  return [];
}

export async function getGitRepoInfo(
  _repositoryPath: string,
  _commitLimit = 8
): Promise<GitRepoInfo> {
  return {
    commits: [],
    branches: [],
    remotes: [],
    tags: [],
    stashCount: 0,
    currentBranch: 'main',
    diffStats: null,
    workingTree: { staged: 0, modified: 0, untracked: 0 },
  };
}
