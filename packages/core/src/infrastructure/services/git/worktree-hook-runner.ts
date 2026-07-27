/**
 * Worktree Hook Runner
 *
 * Executes the user-configured worktree provisioning commands from
 * `settings.worktree`. See WorktreeConfig in tsp/domain/entities/settings.tsp
 * for the contract exposed to users.
 *
 * Both commands are full shell command lines authored by the user, so they are
 * handed to the platform shell rather than exec'd directly. They are passed as
 * the command with an EMPTY argument list, which is the one shape where
 * `shell: true` carries no argument-escaping hazard on Windows (there is
 * nothing for cmd.exe to re-tokenise) while still giving users pipes, `&&`,
 * and variable expansion.
 */

import { existsSync } from 'node:fs';
import { injectable, inject } from 'tsyringe';
import type {
  IWorktreeHookRunner,
  WorktreeHookContext,
} from '../../../application/ports/output/services/worktree-hook-runner.interface.js';
import {
  WorktreeError,
  WorktreeErrorCode,
} from '../../../application/ports/output/services/worktree-service.interface.js';
import type { ISettingsProvider } from '../../../application/ports/output/services/settings-provider.interface.js';
import type { WorktreeConfig } from '../../../domain/generated/output.js';
import {
  normalizeWorktreeConfig,
  resolveWorktreeCommandTimeoutMs,
} from '../../../domain/shared/worktree-config.js';
import type { ExecFunction } from './worktree.service.js';

/** Cap on captured stdout/stderr so a chatty install script cannot exhaust memory. */
const COMMAND_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** Characters of hook output kept in the error message when a hook fails. */
const ERROR_OUTPUT_MAX_CHARS = 2000;

const ENV_REPO_PATH = 'SHEP_REPO_PATH';
const ENV_WORKTREE_PATH = 'SHEP_WORKTREE_PATH';
const ENV_BRANCH = 'SHEP_BRANCH';
const ENV_START_POINT = 'SHEP_START_POINT';

/** Human-readable hook labels used in error messages. */
const CREATE_HOOK_LABEL = 'worktree.createCommand';
const POST_CREATE_HOOK_LABEL = 'worktree.postCreateCommand';

@injectable()
export class WorktreeHookRunner implements IWorktreeHookRunner {
  constructor(
    @inject('ExecFunction') private readonly execFile: ExecFunction,
    @inject('ISettingsProvider') private readonly settingsProvider: ISettingsProvider
  ) {}

  hasCreateHook(): boolean {
    return this.readCommand('createCommand') !== undefined;
  }

  async runCreateHook(context: WorktreeHookContext): Promise<void> {
    const command = this.readCommand('createCommand');
    if (!command) {
      throw new WorktreeError(
        `No ${CREATE_HOOK_LABEL} is configured`,
        WorktreeErrorCode.HOOK_FAILED
      );
    }

    await this.run(command, CREATE_HOOK_LABEL, context.repoPath, context);

    if (!existsSync(context.worktreePath)) {
      throw new WorktreeError(
        `${CREATE_HOOK_LABEL} completed but did not create ${context.worktreePath}. ` +
          `The command must provision the worktree at $${ENV_WORKTREE_PATH}.`,
        WorktreeErrorCode.HOOK_FAILED
      );
    }
  }

  async runPostCreateHook(context: WorktreeHookContext): Promise<void> {
    const command = this.readCommand('postCreateCommand');
    if (!command) return;

    await this.run(command, POST_CREATE_HOOK_LABEL, context.worktreePath, context);
  }

  /**
   * The user's worktree config in canonical form — blank commands already
   * dropped — or undefined before settings have loaded.
   */
  private readConfig(): WorktreeConfig | undefined {
    if (!this.settingsProvider.has()) return undefined;
    return normalizeWorktreeConfig(this.settingsProvider.get().worktree);
  }

  private readCommand(key: 'createCommand' | 'postCreateCommand'): string | undefined {
    return this.readConfig()?.[key];
  }

  private async run(
    command: string,
    label: string,
    cwd: string,
    context: WorktreeHookContext
  ): Promise<void> {
    try {
      await this.execFile(command, [], {
        cwd,
        shell: true,
        windowsHide: true,
        timeout: resolveWorktreeCommandTimeoutMs(this.readConfig()),
        maxBuffer: COMMAND_MAX_BUFFER_BYTES,
        env: {
          ...process.env,
          [ENV_REPO_PATH]: context.repoPath,
          [ENV_WORKTREE_PATH]: context.worktreePath,
          [ENV_BRANCH]: context.branch,
          [ENV_START_POINT]: context.startPoint ?? '',
        },
      });
    } catch (error) {
      throw new WorktreeError(
        `${label} failed in ${cwd}: ${describeCommandFailure(command, error)}`,
        WorktreeErrorCode.HOOK_FAILED,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Build a diagnostic string from an execFile rejection. Shell commands write
 * their most useful output to stdout as often as stderr, so both are captured.
 */
function describeCommandFailure(command: string, error: unknown): string {
  const parts = [`\`${command}\``];
  const failure = error as { stdout?: string; stderr?: string; message?: string } | undefined;

  const message = error instanceof Error ? error.message : String(error);
  if (message) parts.push(message);

  const output = [failure?.stdout, failure?.stderr]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join('\n')
    .trim();
  if (output) parts.push(output.slice(0, ERROR_OUTPUT_MAX_CHARS));

  return parts.join('\n');
}
