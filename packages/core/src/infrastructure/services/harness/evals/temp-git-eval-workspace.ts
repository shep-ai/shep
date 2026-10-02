/**
 * Throwaway git repositories for eval cases (spec 119, task 33): inline files
 * are committed into a fresh repository; an existing repository is cloned
 * (never touched) and checked out at the case's ref.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, relative, isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import type {
  HarnessEvalCaseDef,
  HarnessEvalCheckResult,
  HarnessEvalWorkspace,
  IHarnessEvalWorkspaceFactory,
} from '../../../../application/ports/output/harness/index.js';
import { assertSafeGitRef } from '../../../../domain/shared/git-ref-argument.js';
import { runShell } from '../tools/tool-support.js';

const execFileAsync = promisify(execFile);
const IDENTITY = [
  '-c',
  'user.name=Shep Eval',
  '-c',
  'user.email=shep-eval@users.noreply.local',
  '-c',
  'commit.gpgsign=false',
];

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', [...IDENTITY, ...args], { cwd, windowsHide: true });
}

export class TempGitEvalWorkspaceFactory implements IHarnessEvalWorkspaceFactory {
  async prepare(evalCase: HarnessEvalCaseDef): Promise<HarnessEvalWorkspace> {
    const root = await mkdtemp(join(tmpdir(), 'shep-eval-'));
    const cleanup = () => rm(root, { recursive: true, force: true });
    try {
      if (evalCase.repo) {
        await execFileAsync(
          'git',
          ['clone', '--quiet', '--no-hardlinks', '--', evalCase.repo, root],
          { windowsHide: true }
        );
        if (evalCase.ref)
          await git(root, ['checkout', '--quiet', assertSafeGitRef(evalCase.ref, 'ref')]);
      } else {
        await git(root, ['init', '--quiet', '-b', 'main']);
      }
      for (const [rel, content] of Object.entries(evalCase.files ?? {})) {
        const target = join(root, normalize(rel));
        const inside = relative(root, target);
        if (isAbsolute(rel) || inside.startsWith('..'))
          throw new Error(`Eval file outside the workspace: ${rel}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, 'utf8');
      }
      if (evalCase.files) {
        await git(root, ['add', '-A']);
        await git(root, ['commit', '--quiet', '--allow-empty', '-m', `eval: ${evalCase.id}`]);
      }
      return { root, cleanup };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  async runCheck(
    root: string,
    command: string,
    timeoutMs: number
  ): Promise<HarnessEvalCheckResult> {
    const res = await runShell(command, { cwd: root, timeoutMs });
    return { passed: res.exitCode === 0 && !res.timedOut, output: res.output };
  }
}
