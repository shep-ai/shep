/**
 * Throwaway git repository for harness integration tests.
 *
 * Isolates the host's global/system git config and disables commit signing
 * (LESSONS.md: real-git tests must not depend on ambient config).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * An empty config file stands in for the global and system configs. `NUL` is
 * refused by newer Git for Windows ("unable to access 'NUL'"), and an empty
 * file reads the same on every platform and git version.
 */
const EMPTY_GIT_CONFIG = join(mkdtempSync(join(tmpdir(), 'shep-git-config-')), 'empty.gitconfig');
writeFileSync(EMPTY_GIT_CONFIG, '');

export const ISOLATED_GIT_ENV = {
  GIT_CONFIG_GLOBAL: EMPTY_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: EMPTY_GIT_CONFIG,
};

/** Apply the isolated git env to this process; returns a restore function. */
export function isolateGitEnv(): () => void {
  const previous = { ...process.env };
  Object.assign(process.env, ISOLATED_GIT_ENV);
  return () => {
    for (const key of Object.keys(ISOLATED_GIT_ENV)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

export interface TempGitRepo {
  root: string;
  write(path: string, content: string): void;
  git(...args: string[]): string;
  commitAll(message: string): void;
  cleanup(): void;
}

export function createTempGitRepo(files: Record<string, string> = {}): TempGitRepo {
  const root = mkdtempSync(join(tmpdir(), 'shep-harness-repo-'));
  const env = { ...process.env, ...ISOLATED_GIT_ENV };
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' });
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Harness Test');
  git('config', 'user.email', 'harness@test.local');
  git('config', 'commit.gpgsign', 'false');
  for (const [path, content] of Object.entries(files)) write(path, content);
  const commitAll = (message: string) => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  if (Object.keys(files).length > 0) commitAll('initial');
  return {
    root,
    write,
    git,
    commitAll,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
