/**
 * Custom Worktree Provisioning Integration Tests
 *
 * Exercises the real hook runner against a real git repository and a real
 * shell, proving the end-to-end path a user configures in
 * Settings → Worktree (issue #833).
 *
 * Hook commands are written as `node -e "..."` so they behave identically
 * under `cmd.exe` and POSIX shells — CI runs on both.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

import { WorktreeService } from '../../../../../packages/core/src/infrastructure/services/git/worktree.service.js';
import { WorktreeHookRunner } from '../../../../../packages/core/src/infrastructure/services/git/worktree-hook-runner.js';
import { WorktreeErrorCode } from '../../../../../packages/core/src/application/ports/output/services/worktree-service.interface.js';
import type { ISettingsProvider } from '../../../../../packages/core/src/application/ports/output/services/settings-provider.interface.js';
import type {
  Settings,
  WorktreeConfig,
} from '../../../../../packages/core/src/domain/generated/output.js';

const execFile = promisify(execFileCb);
const exec = (file: string, args: string[], options?: object) =>
  execFile(file, args, options ?? {}) as Promise<{ stdout: string; stderr: string }>;

const BRANCH = 'feat/custom-provisioning';

/** Writes every SHEP_* variable the hook received into `provisioned.txt`. */
const RECORD_ENV_COMMAND =
  "node -e \"const fs=require('fs');" +
  "fs.writeFileSync('provisioned.txt',[process.env.SHEP_REPO_PATH,process.env.SHEP_WORKTREE_PATH," +
  'process.env.SHEP_BRANCH,process.env.SHEP_START_POINT].join(String.fromCharCode(10)))"';

/** Stands in for a user's own worktree tool by shelling out to git itself. */
const CUSTOM_CREATE_COMMAND =
  "node -e \"require('child_process').execFileSync('git'," +
  "['worktree','add',process.env.SHEP_WORKTREE_PATH,'-b',process.env.SHEP_BRANCH," +
  'process.env.SHEP_START_POINT])"';

function settingsProviderFor(worktree: WorktreeConfig): ISettingsProvider {
  return { has: () => true, get: () => ({ worktree }) as unknown as Settings };
}

function serviceFor(worktree: WorktreeConfig): WorktreeService {
  return new WorktreeService(exec, new WorktreeHookRunner(exec, settingsProviderFor(worktree)));
}

describe('custom worktree provisioning (integration)', () => {
  let repoPath: string;
  let worktreePath: string;

  beforeEach(async () => {
    repoPath = mkdtempSync(join(tmpdir(), 'shep-wt-repo-'));
    worktreePath = join(mkdtempSync(join(tmpdir(), 'shep-wt-out-')), 'wt');

    await exec('git', ['init', '-b', 'main'], { cwd: repoPath });
    await exec('git', ['config', 'user.name', 'Shep Test'], { cwd: repoPath });
    await exec('git', ['config', 'user.email', 'test@shep.bot'], { cwd: repoPath });
    writeFileSync(join(repoPath, 'README.md'), '# fixture\n');
    await exec('git', ['add', '.'], { cwd: repoPath });
    await exec('git', ['commit', '--no-gpg-sign', '-m', 'Initial commit'], { cwd: repoPath });
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
    rmSync(join(worktreePath, '..'), { recursive: true, force: true });
  });

  it('runs the post-create command inside the new worktree with SHEP_ variables set', async () => {
    const service = serviceFor({ postCreateCommand: RECORD_ENV_COMMAND });

    const info = await service.create(repoPath, BRANCH, worktreePath, 'main');

    expect(info.branch).toBe(BRANCH);
    const marker = join(worktreePath, 'provisioned.txt');
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, 'utf8').split('\n')).toEqual([
      repoPath,
      worktreePath,
      BRANCH,
      'main',
    ]);
  });

  it('makes a repo-level directory reachable from the worktree (the monorepo case)', async () => {
    // Stand-in for a hoisted node_modules the worktree must be able to resolve.
    mkdirSync(join(repoPath, 'node_modules'), { recursive: true });
    writeFileSync(join(repoPath, 'node_modules', 'marker.txt'), 'hoisted\n');

    const service = serviceFor({
      postCreateCommand:
        "node -e \"require('fs').symlinkSync(" +
        "require('path').join(process.env.SHEP_REPO_PATH,'node_modules')," +
        "'node_modules','junction')\"",
    });

    await service.create(repoPath, BRANCH, worktreePath, 'main');

    expect(readFileSync(join(worktreePath, 'node_modules', 'marker.txt'), 'utf8')).toBe(
      'hoisted\n'
    );
  });

  it('uses the custom create command instead of `git worktree add`', async () => {
    const service = serviceFor({
      createCommand: CUSTOM_CREATE_COMMAND,
      postCreateCommand: RECORD_ENV_COMMAND,
    });

    const info = await service.create(repoPath, BRANCH, worktreePath, 'main');

    expect(info.branch).toBe(BRANCH);
    expect(info.path).toBeTruthy();
    expect(existsSync(join(worktreePath, 'README.md'))).toBe(true);
    // The post-create hook still runs after a custom create.
    expect(existsSync(join(worktreePath, 'provisioned.txt'))).toBe(true);
  });

  it('fails with HOOK_FAILED when the create command does not produce the worktree', async () => {
    const service = serviceFor({ createCommand: 'node -e "process.exit(0)"' });

    const error = await service
      .create(repoPath, BRANCH, worktreePath, 'main')
      .then(() => undefined)
      .catch((e: unknown) => e as { code?: string; message?: string });

    expect(error?.code).toBe(WorktreeErrorCode.HOOK_FAILED);
    expect(error?.message).toContain('did not create');
  });

  it('fails with HOOK_FAILED and surfaces the output when the post-create command fails', async () => {
    const service = serviceFor({
      postCreateCommand: 'node -e "console.log(\'setup broke\');process.exit(3)"',
    });

    const error = await service
      .create(repoPath, BRANCH, worktreePath, 'main')
      .then(() => undefined)
      .catch((e: unknown) => e as { code?: string; message?: string });

    expect(error?.code).toBe(WorktreeErrorCode.HOOK_FAILED);
    expect(error?.message).toContain('worktree.postCreateCommand');
    expect(error?.message).toContain('setup broke');
  });
});
