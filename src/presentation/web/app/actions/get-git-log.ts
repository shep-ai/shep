'use server';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 5000 });
  return stdout.trim();
}

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

export async function getGitRepoInfo(
  repositoryPath: string,
  commitLimit = 8
): Promise<GitRepoInfo> {
  const empty: GitRepoInfo = {
    commits: [],
    branches: [],
    remotes: [],
    tags: [],
    stashCount: 0,
    currentBranch: '',
    diffStats: null,
    workingTree: { staged: 0, modified: 0, untracked: 0 },
  };

  if (!repositoryPath.trim()) {
    return { ...empty, error: 'Repository path is required' };
  }

  const results = await Promise.allSettled([
    // 0: commits
    git(repositoryPath, [
      'log',
      `--max-count=${commitLimit}`,
      '--format=%H%x00%h%x00%s%x00%an%x00%cr',
      '--no-color',
    ]),
    // 1: current branch
    git(repositoryPath, ['branch', '--show-current']),
    // 2: branches with dates
    git(repositoryPath, [
      'branch',
      '--sort=-committerdate',
      '--format=%(HEAD)%(refname:short)%00%(committerdate:relative)',
      '--no-color',
    ]),
    // 3: remotes
    git(repositoryPath, ['remote', '-v']),
    // 4: tags (recent 5)
    git(repositoryPath, ['tag', '--sort=-creatordate', '-l', '--format=%(refname:short)']),
    // 5: stash count
    git(repositoryPath, ['stash', 'list']),
    // 6: working tree status
    git(repositoryPath, ['status', '--porcelain']),
    // 7: diff stats (uncommitted — includes staged + unstaged vs HEAD)
    git(repositoryPath, ['diff', 'HEAD', '--shortstat']),
  ]);

  const val = (i: number) => (results[i].status === 'fulfilled' ? results[i].value : '');

  // Parse commits
  const commits: GitLogEntry[] = val(0)
    .split('\n')
    .filter(Boolean)
    .map((line: string) => {
      const [hash, shortHash, subject, author, relativeDate] = line.split('\0');
      return { hash, shortHash, subject, author, relativeDate };
    });

  const currentBranch = val(1);
  if (commits.length > 0 && currentBranch) {
    commits[0].branch = currentBranch;
  }

  // Parse branches
  const branches: GitBranchInfo[] = val(2)
    .split('\n')
    .filter(Boolean)
    .slice(0, 10)
    .map((line: string) => {
      const isCurrent = line.startsWith('*');
      const clean = isCurrent ? line.slice(1) : line;
      const [name, lastCommitDate] = clean.split('\0');
      return { name: name.trim(), isCurrent, lastCommitDate: lastCommitDate?.trim() ?? '' };
    });

  // Parse remotes (dedup fetch/push)
  const remoteMap = new Map<string, string>();
  val(3)
    .split('\n')
    .filter(Boolean)
    .forEach((line: string) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/);
      if (match) {
        // Strip credentials/tokens from URL before sending to client
        const sanitized = match[2].replace(/\/\/[^@]+@/, '//').replace(/x-access-token:[^@]+@/, '');
        remoteMap.set(match[1], sanitized);
      }
    });
  const remotes: GitRemoteInfo[] = Array.from(remoteMap, ([name, url]) => ({ name, url }));

  // Parse tags (top 5)
  const tags = val(4).split('\n').filter(Boolean).slice(0, 5);

  // Stash count
  const stashCount = val(5).split('\n').filter(Boolean).length;

  // Working tree status
  const statusLines = val(6).split('\n').filter(Boolean);
  const workingTree: GitWorkingTreeStatus = { staged: 0, modified: 0, untracked: 0 };
  for (const line of statusLines) {
    const x = line[0];
    const y = line[1];
    if (x === '?' && y === '?') workingTree.untracked++;
    else if (x !== ' ' && x !== '?') workingTree.staged++;
    if (y !== ' ' && y !== '?') workingTree.modified++;
  }

  // Diff stats
  let diffStats: GitDiffStats | null = null;
  const diffLine = val(7);
  if (diffLine) {
    const files = diffLine.match(/(\d+) file/);
    const ins = diffLine.match(/(\d+) insertion/);
    const del = diffLine.match(/(\d+) deletion/);
    diffStats = {
      filesChanged: files ? parseInt(files[1], 10) : 0,
      insertions: ins ? parseInt(ins[1], 10) : 0,
      deletions: del ? parseInt(del[1], 10) : 0,
    };
  }

  return { commits, branches, remotes, tags, stashCount, currentBranch, diffStats, workingTree };
}

// Keep backward compat
export async function getGitLog(
  repositoryPath: string,
  limit = 10
): Promise<{ entries: GitLogEntry[]; error?: string }> {
  const info = await getGitRepoInfo(repositoryPath, limit);
  return { entries: info.commits, error: info.error };
}
