/**
 * Repository setup port of the harness (spec 119, F2 / `shep harness init`).
 * Detection is read-only; writes are confined to `<repo>/.shep/harness/`.
 */

/** Directory, relative to the repository, that holds every harness file. */
export const HARNESS_PROJECT_DIR = '.shep/harness';

export interface HarnessProjectInspection {
  /** Repository-relative instruction files (CLAUDE.md, AGENTS.md, rules). */
  instructionFiles: string[];
  /** Repository-relative package manifests. */
  manifests: string[];
  testCommand?: string;
  lintCommand?: string;
  /** Repository-relative sensitive files present (.env*, keys). */
  sensitivePaths: string[];
}

export interface HarnessProjectFile {
  /** Path relative to the repository; must live under HARNESS_PROJECT_DIR. */
  path: string;
  content: string;
}

export interface IHarnessProjectSetup {
  inspect(repoRoot: string): Promise<HarnessProjectInspection>;
  /** Existing content of a repository-relative file, if any. */
  read(repoRoot: string, path: string): Promise<string | undefined>;
  write(repoRoot: string, files: readonly HarnessProjectFile[]): Promise<void>;
}

/** Repository config written by `shep harness init` (`.shep/harness/config.yaml`). */
export interface HarnessProjectConfig {
  testCommand?: string;
  lintCommand?: string;
}
