/**
 * Repository snapshotter (spec 119): a content fingerprint of a working tree
 * so evidence can bind to a version and resume can detect drift.
 */

export interface RepoSnapshotCapture {
  root: string;
  gitCommit?: string;
  workingTreeHash: string;
  stagedDiffHash?: string;
  unstagedDiffHash?: string;
  /** Per-file content hashes (repository-relative path → sha256). */
  fileHashes: Record<string, string>;
}

export interface RepoDrift {
  drifted: boolean;
  changedPaths: string[];
}

export interface IRepoSnapshotter {
  capture(root: string): Promise<RepoSnapshotCapture>;
  /** Compare a previous capture's file hashes with the tree as it is now. */
  compare(previous: Pick<RepoSnapshotCapture, 'fileHashes'>, root: string): Promise<RepoDrift>;
}
