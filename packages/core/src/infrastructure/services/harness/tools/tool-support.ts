/**
 * Shared helpers for the builtin harness tools (spec 119): repository path
 * confinement, a capped process runner, and listing repository files.
 */
import { spawn, execFile } from 'node:child_process';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { isPathInside } from '../../../../domain/shared/path-confinement.js';
import {
  ToolSourceKind,
  type RiskClass,
  type ToolImplementation,
  type ToolReadWriteMode,
} from '../../../../domain/generated/output.js';

const execFileAsync = promisify(execFile);

/** Raw tool output above this size is cut, and the cut is recorded. */
export const MAX_TOOL_OUTPUT_BYTES = 512 * 1024;
const KILL_GRACE_MS = 2000;
const MAX_LIST_BUFFER = 64 * 1024 * 1024;
/** Files larger than this are cut when read or skipped when scanned. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_GIT_BUFFER = 64 * 1024 * 1024;

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/** Resolve a user/model-supplied path inside `repoRoot`, or throw. */
export function resolveInsideRepo(
  repoRoot: string,
  cwd: string,
  path: string
): { abs: string; rel: string } {
  const abs = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  if (!isPathInside(repoRoot, abs)) {
    throw new ToolInputError(`Path "${path}" is outside the repository`);
  }
  const rel = relative(repoRoot, abs).split(sep).join('/');
  return { abs, rel: rel === '' ? '.' : rel };
}

export interface ProcessResult {
  exitCode: number | null;
  output: string;
  truncated: boolean;
  timedOut: boolean;
  aborted: boolean;
}

/** Run a shell command with a timeout and an output cap (stdout+stderr interleaved). */
export function runShell(
  command: string,
  options: { cwd: string; timeoutMs: number; abortSignal?: AbortSignal; maxBytes?: number }
): Promise<ProcessResult> {
  const maxBytes = options.maxBytes ?? MAX_TOOL_OUTPUT_BYTES;
  return new Promise((resolvePromise) => {
    const isWindows = process.platform === 'win32';
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      windowsHide: true,
      // Own process group on POSIX so a timeout kills the whole tree, not
      // just the shell (a grandchild holding the pipe would block `close`).
      detached: !isWindows,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    const collect = (data: Buffer) => {
      if (size >= maxBytes) {
        truncated = true;
        return;
      }
      const room = maxBytes - size;
      const piece = data.length > room ? data.subarray(0, room) : data;
      if (data.length > room) truncated = true;
      chunks.push(piece);
      size += piece.length;
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const signalTree = (signal: NodeJS.Signals) => {
      if (child.pid === undefined || child.exitCode !== null) return;
      if (isWindows) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const kill = () => {
      signalTree('SIGTERM');
      setTimeout(() => signalTree('SIGKILL'), KILL_GRACE_MS).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    const onAbort = () => {
      aborted = true;
      kill();
    };
    options.abortSignal?.addEventListener('abort', onAbort, { once: true });
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      options.abortSignal?.removeEventListener('abort', onAbort);
      resolvePromise({
        exitCode,
        output: Buffer.concat(chunks).toString('utf8'),
        truncated,
        timedOut,
        aborted,
      });
    };
    child.on('error', (error) => {
      chunks.push(Buffer.from(`\n[spawn error] ${error.message}\n`));
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** Repository files (tracked + untracked, not ignored), repo-relative, sorted. */
export async function listRepoFiles(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoRoot, 'ls-files', '-co', '--exclude-standard', '-z'],
      { maxBuffer: MAX_LIST_BUFFER, encoding: 'utf8', windowsHide: true }
    );
    return [...new Set(stdout.split('\0').filter(Boolean))].sort();
  } catch {
    return [];
  }
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ToolInputError(`"${field}" must be a non-empty string`);
  }
  return value;
}

export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Build a builtin ToolImplementation descriptor. */
export function impl(
  id: string,
  capabilityId: string,
  toolName: string,
  snippet: string,
  readWriteMode: ToolReadWriteMode,
  risk: RiskClass,
  inputSchema: Record<string, unknown>,
  docs?: string
): ToolImplementation {
  return {
    id,
    capabilityId,
    source: ToolSourceKind.Builtin,
    toolName,
    snippet,
    inputSchema,
    readWriteMode,
    risk,
    ...(docs && { docs }),
  };
}
