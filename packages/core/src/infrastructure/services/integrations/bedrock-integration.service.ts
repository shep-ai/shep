/**
 * BedrockIntegrationService — concrete adapter for IBedrockIntegrationService.
 *
 * Two pathways:
 *   - Short probes (`doctor`, `verifyPipx`, `verifyBedrockBinary`) go through
 *     the constructor-injected `ExecFunction` token. That function already
 *     handles the Windows .cmd quoting quirk and is trivially mockable for
 *     unit tests.
 *   - Streaming lifecycle commands (`init`, `sync`, `ship`) drop down to
 *     `child_process.spawn` so stdout/stderr can be piped through the
 *     `onProgress` callback as they arrive. We pass args as an array, never
 *     set `shell: true`, and always set `windowsHide: true` per the
 *     cross-platform rules in packages/CLAUDE.md.
 *
 * The adapter is a pure executor: it never persists, never touches the
 * `.claude/` reconciler, and never speaks to the domain layer. Callers
 * (use cases) orchestrate enable-flow side effects.
 */

import { spawn } from 'node:child_process';
import { injectable, inject } from 'tsyringe';

import { BedrockBinaryMissingError } from '../../../domain/errors/bedrock-binary-missing.error.js';
import { PipxNotInstalledError } from '../../../domain/errors/pipx-not-installed.error.js';
import {
  type BedrockHealth,
  BedrockLifecycleAction,
  type BedrockTierStatus,
} from '../../../domain/generated/output.js';
import type {
  BedrockLifecycleOptions,
  BedrockLifecycleResult,
  BedrockProgressHandler,
  IBedrockIntegrationService,
} from '../../../application/ports/output/services/bedrock-integration.service.js';
import type { ExecFunction } from '../git/worktree.service.js';

const PYTHON_BINARY = 'python3';
const PIPX_BINARY = 'pipx';
const BEDROCK_BINARY = 'bedrock';

/** Minimum Python version that project-bedrock supports per its PyPI metadata. */
const PYTHON_MIN_MAJOR = 3;
const PYTHON_MIN_MINOR = 9;

/** Matches "Python 3.11.4", "Python 3.9", etc. at the start of stdout. */
const PYTHON_VERSION_PATTERN = /^Python (\d+)\.(\d+)(?:\.(\d+))?/m;

const PYTHON_REMEDIATION = `Install Python ${PYTHON_MIN_MAJOR}.${PYTHON_MIN_MINOR}+ from python.org and re-run the bedrock doctor.`;

interface NodeErrnoLike {
  code?: string;
  message?: string;
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeErrnoLike).code === 'ENOENT';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

@injectable()
export class BedrockIntegrationService implements IBedrockIntegrationService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async init(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult> {
    return this.runLifecycle(BedrockLifecycleAction.Init, opts);
  }

  async sync(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult> {
    return this.runLifecycle(BedrockLifecycleAction.Sync, opts);
  }

  async ship(opts: BedrockLifecycleOptions): Promise<BedrockLifecycleResult> {
    return this.runLifecycle(BedrockLifecycleAction.Ship, opts);
  }

  async doctor(): Promise<BedrockHealth> {
    const python = await this.probePython();
    const pipx = await this.probePipx();
    const bedrock = await this.probeBedrock();
    const overall = rollUp(python.status, pipx.status, bedrock.status);
    return { python, pipx, bedrock, overall };
  }

  /**
   * Adapter-only helper used by the tool-installer verify path. Throws the
   * typed domain error so presentation layers can present remediation
   * directly rather than parsing generic ENOENT messages.
   */
  async verifyPipx(): Promise<void> {
    try {
      await this.execFile(PIPX_BINARY, ['--version']);
    } catch (err) {
      if (isEnoent(err)) throw new PipxNotInstalledError();
      throw err;
    }
  }

  /**
   * Adapter-only helper used by the tool-installer verify path. Throws the
   * typed domain error when the bedrock binary is not resolvable on PATH.
   */
  async verifyBedrockBinary(): Promise<void> {
    try {
      await this.execFile(BEDROCK_BINARY, ['--version']);
    } catch (err) {
      if (isEnoent(err)) throw new BedrockBinaryMissingError();
      throw err;
    }
  }

  private async probePython(): Promise<BedrockTierStatus> {
    try {
      const { stdout } = await this.execFile(PYTHON_BINARY, ['--version']);
      const combined = stdout.length > 0 ? stdout : '';
      const match = PYTHON_VERSION_PATTERN.exec(combined);
      if (!match) {
        return {
          tier: PYTHON_BINARY,
          status: 'error',
          detail: combined.trim(),
          remediation: PYTHON_REMEDIATION,
        };
      }
      const major = Number(match[1]);
      const minor = Number(match[2]);
      const versionOk =
        major > PYTHON_MIN_MAJOR || (major === PYTHON_MIN_MAJOR && minor >= PYTHON_MIN_MINOR);
      if (!versionOk) {
        return {
          tier: PYTHON_BINARY,
          status: 'error',
          detail: `${major}.${minor}`,
          remediation: PYTHON_REMEDIATION,
        };
      }
      return {
        tier: PYTHON_BINARY,
        status: 'ok',
        detail: `${major}.${minor}${match[3] ? `.${match[3]}` : ''}`,
      };
    } catch (err) {
      if (isEnoent(err)) {
        return {
          tier: PYTHON_BINARY,
          status: 'missing',
          remediation: PYTHON_REMEDIATION,
        };
      }
      return { tier: PYTHON_BINARY, status: 'error', detail: errMessage(err) };
    }
  }

  private async probePipx(): Promise<BedrockTierStatus> {
    try {
      const { stdout } = await this.execFile(PIPX_BINARY, ['--version']);
      return { tier: PIPX_BINARY, status: 'ok', detail: stdout.trim() };
    } catch (err) {
      if (isEnoent(err)) {
        const remediation = new PipxNotInstalledError().remediation;
        return { tier: PIPX_BINARY, status: 'missing', remediation };
      }
      return { tier: PIPX_BINARY, status: 'error', detail: errMessage(err) };
    }
  }

  private async probeBedrock(): Promise<BedrockTierStatus> {
    try {
      const { stdout } = await this.execFile(BEDROCK_BINARY, ['--version']);
      return { tier: BEDROCK_BINARY, status: 'ok', detail: stdout.trim() };
    } catch (err) {
      if (isEnoent(err)) {
        const remediation = new BedrockBinaryMissingError().remediation;
        return { tier: BEDROCK_BINARY, status: 'missing', remediation };
      }
      return { tier: BEDROCK_BINARY, status: 'error', detail: errMessage(err) };
    }
  }

  private runLifecycle(
    action: BedrockLifecycleAction,
    opts: BedrockLifecycleOptions
  ): Promise<BedrockLifecycleResult> {
    return new Promise<BedrockLifecycleResult>((resolve, reject) => {
      const child = spawn(BEDROCK_BINARY, [action], {
        cwd: opts.cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const wire = (
        stream: NodeJS.ReadableStream | null,
        kind: 'stdout' | 'stderr',
        sink: (chunk: string) => void
      ): void => {
        if (!stream) return;
        stream.on('data', (data: Buffer | string) => {
          const text = typeof data === 'string' ? data : data.toString('utf8');
          sink(text);
          emit(opts.onProgress, kind, text);
        });
      };

      wire(child.stdout, 'stdout', (text) => {
        stdout += text;
      });
      wire(child.stderr, 'stderr', (text) => {
        stderr += text;
      });

      child.on('error', (err: Error) => {
        if (isEnoent(err)) {
          reject(new BedrockBinaryMissingError());
          return;
        }
        reject(err);
      });

      child.on('close', (code: number | null) => {
        resolve({
          action,
          stdout,
          stderr,
          exitCode: typeof code === 'number' ? code : -1,
        });
      });
    });
  }
}

function emit(
  onProgress: BedrockProgressHandler | undefined,
  stream: 'stdout' | 'stderr',
  data: string
): void {
  if (!onProgress) return;
  onProgress({ stream, data });
}

function rollUp(...statuses: readonly BedrockTierStatus['status'][]): BedrockHealth['overall'] {
  if (statuses.every((s) => s === 'ok')) return 'ok';
  if (statuses.some((s) => s === 'error')) return 'error';
  return 'missing';
}
