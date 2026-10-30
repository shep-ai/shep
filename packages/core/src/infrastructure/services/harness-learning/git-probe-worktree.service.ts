/**
 * GitProbeWorktreeService (spec 150 — Explore mode)
 *
 * Probes are detached `git worktree add` checkouts under the OS temp dir,
 * forked from one commit, so they share the repository's objects: a commit
 * made in a probe can be fast-forwarded into the feature worktree directly.
 * Checks are the repository's own test command (configured in
 * `.shep/harness/config.yaml`, else detected), run through the shared shell
 * runner with a timeout.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject, injectable } from 'tsyringe';
import type {
  IProbeWorktreeService,
  ProbeCheckResult,
  ProbeOutcome,
  ProbeWorktree,
} from '../../../application/ports/output/services/probe-worktree.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';
import { detectTestCommand } from '../harness/tools/run-tests.tool.js';
import { runShell } from '../harness/tools/tool-support.js';

const PROBE_PREFIX = 'shep-probe-';
const CHECK_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_OUTPUT_TAIL = 8000;
const MAX_DIFF_CHARS = 200_000;
const GIT_BUFFER = 64 * 1024 * 1024;
const PROBE_COMMIT_MESSAGE = 'shep: explore probe';
const IDENTITY = [
  '-c',
  'user.name=Shep',
  '-c',
  'user.email=shep@localhost',
  '-c',
  'commit.gpgsign=false',
];

@injectable()
export class GitProbeWorktreeService implements IProbeWorktreeService {
  constructor(@inject('ExecFunction') private readonly exec: ExecFunction) {}

  private git(cwd: string, args: string[]): Promise<string> {
    return this.exec('git', args, { cwd, maxBuffer: GIT_BUFFER }).then((r) => r.stdout);
  }

  async headCommit(featureWorktree: string): Promise<string> {
    return (await this.git(featureWorktree, ['rev-parse', 'HEAD'])).trim();
  }

  async fork(featureWorktree: string, baseCommit: string, label: string): Promise<ProbeWorktree> {
    const parent = await mkdtemp(
      join(tmpdir(), `${PROBE_PREFIX}${label.replace(/[^\w-]/g, '-')}-`)
    );
    const path = join(parent, 'wt');
    await this.git(featureWorktree, ['worktree', 'add', '--detach', path, baseCommit]);
    return { label, path, baseCommit };
  }

  async inspect(probe: ProbeWorktree): Promise<ProbeOutcome> {
    await this.git(probe.path, ['add', '-A']);
    const staged = (await this.git(probe.path, ['diff', '--cached', '--name-only'])).trim();
    if (staged)
      await this.git(probe.path, [...IDENTITY, 'commit', '-q', '-m', PROBE_COMMIT_MESSAGE]);
    const range = `${probe.baseCommit}..HEAD`;
    const diff = await this.git(probe.path, ['diff', range]);
    const diffStat = (await this.git(probe.path, ['diff', '--stat', range])).trim();
    return {
      label: probe.label,
      diff:
        diff.length > MAX_DIFF_CHARS
          ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)`
          : diff,
      diffStat,
      delivered: diff.trim().length > 0,
      checks: await this.runChecks(probe.path),
    };
  }

  private async runChecks(cwd: string): Promise<ProbeCheckResult[]> {
    const command = await detectTestCommand(cwd);
    if (!command) return [];
    const result = await runShell(command, { cwd, timeoutMs: CHECK_TIMEOUT_MS });
    return [
      {
        command,
        passed: result.exitCode === 0 && !result.timedOut,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        output: result.output.slice(-CHECK_OUTPUT_TAIL),
      },
    ];
  }

  async adopt(probe: ProbeWorktree, featureWorktree: string): Promise<void> {
    const head = (await this.git(probe.path, ['rev-parse', 'HEAD'])).trim();
    if (head === probe.baseCommit) return;
    await this.git(featureWorktree, ['merge', '--ff-only', '-q', head]);
  }

  async dispose(probe: ProbeWorktree): Promise<void> {
    if (!probe.path.includes(PROBE_PREFIX)) return;
    await this.git(probe.path, ['worktree', 'remove', '--force', probe.path]).catch(
      () => undefined
    );
    await rm(join(probe.path, '..'), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    }).catch(() => undefined);
  }
}
