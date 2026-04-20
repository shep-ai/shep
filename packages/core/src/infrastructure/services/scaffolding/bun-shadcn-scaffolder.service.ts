/**
 * Bun + shadcn Application Scaffolder
 *
 * Produces a ready-to-code Vite + React + TypeScript + Tailwind +
 * shadcn project tree at a given repository path, running entirely
 * inside the Shep process — not inside an agent turn. This is the
 * replacement for the old workflow "scaffold" agent step, which had
 * three recurring failure modes:
 *
 *   1. `bunx shadcn init --template vite` creates a child project
 *      directory even with `--yes`, and a bash flatten one-liner run
 *      from the agent turn was fragile and sometimes skipped.
 *   2. `bun` might not be on PATH on a first-ever run, and bootstrap
 *      inside the agent turn consumed tool calls and thinking tokens.
 *   3. `bun add` for the app-specific extras had to be explicitly
 *      asked for in the prompt — agents sometimes skipped it.
 *
 * This adapter makes the scaffold deterministic by doing all four
 * phases in code with real process calls and real `fs.renameSync`:
 *
 *   Phase 1 — Bootstrap bun:
 *     `bun --version` and, on failure, `npm install -g bun`. This
 *     runs at most once per Shep installation (subsequent scaffolds
 *     hit Phase 1 in microseconds because `bun --version` succeeds).
 *
 *   Phase 2 — Scaffold the base project:
 *     `bunx --bun shadcn@latest init --preset b0 --base base
 *     --template vite --yes` run with `cwd = repositoryPath`. shadcn
 *     chooses a child directory name and drops a complete project
 *     there.
 *
 *   Phase 3 — Flatten:
 *     `flattenSingleChildProject(repositoryPath)` moves the child's
 *     contents up and removes the empty shell. After this step,
 *     `repositoryPath/package.json` is guaranteed.
 *
 *   Phase 4 — Install app-specific extras:
 *     `bun add react-router-dom react-hook-form zod lucide-react`
 *     in a single call. Matches the set the "components" prompt
 *     expects to be available.
 *
 *   Phase 5 — Fat-template overlay:
 *     Copies every file under
 *     `packages/core/src/infrastructure/templates/vite-shadcn-base/`
 *     on top of the scaffolded project. Ships the dark-mode palette,
 *     pre-built `src/components/common/*` pieces (Avatar, StatusDot,
 *     Badge, EmptyState, LoadingSpinner, ErrorBoundary, BottomNav,
 *     TopBar, IconButton, SectionHeader), the `src/lib/*` helpers
 *     (theme, format, mock), `src/types/common.ts`, and `TEMPLATE.md`
 *     at the project root. Eliminates per-app re-invention of
 *     palette, types, and leaf components.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';
import { injectable } from 'tsyringe';
import type {
  IApplicationScaffolder,
  ScaffoldOptions,
  ScaffoldResult,
} from '../../../application/ports/output/services/application-scaffolder.interface.js';
import { flattenSingleChildProject } from './flatten-subdirectory.js';
import { applyTemplateOverlay } from './template-overlay.js';

/**
 * Strip ANSI escape sequences from a byte slice coming out of a child
 * process. Spinner frames and colour codes clutter the UI log without
 * adding information — we keep the plain text so the drawer shows the
 * same content a user would see after stripping their terminal's
 * rendering.
 *
 * This is NOT a general-purpose parser — it only handles the subset of
 * CSI / OSC / cursor sequences that `bunx`, `bun`, `npm`, and
 * `create-vite` actually emit.
 */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]|\x1B\][^\x07]*\x07|\x1B[@-_]/g;

function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '').replace(/\r(?!\n)/g, '');
}

/**
 * Buffered line-splitter. Holds the trailing fragment between writes
 * and flushes each completed line to the caller. Used by `runSpawn` to
 * turn streaming stdout/stderr bytes into discrete log entries.
 */
class LineBuffer {
  private tail = '';
  private lastEmitted: string | null = null;

  constructor(private readonly onLine: (line: string) => void) {}

  write(chunk: string): void {
    const combined = this.tail + chunk;
    const parts = combined.split(/\r?\n/);
    this.tail = parts.pop() ?? '';
    for (const raw of parts) {
      this.emit(raw);
    }
  }

  flush(): void {
    if (this.tail.length > 0) {
      this.emit(this.tail);
      this.tail = '';
    }
  }

  /**
   * Emit a single line, after stripping ANSI and skipping empties /
   * duplicate spinner frames. Collapsing consecutive duplicates is
   * what prevents `⠦ Creating a new Vite project…` from spamming the
   * drawer with hundreds of rows per second.
   */
  private emit(raw: string): void {
    const cleaned = stripAnsi(raw).trimEnd();
    if (cleaned.length === 0) return;
    if (cleaned === this.lastEmitted) return;
    this.lastEmitted = cleaned;
    this.onLine(cleaned);
  }
}

/** Packages the "components" workflow step expects to import. */
const APP_EXTRA_DEPS = ['react-router-dom', 'react-hook-form', 'zod', 'lucide-react'] as const;

const IS_WINDOWS = process.platform === 'win32';

/**
 * Hard ceiling for each scaffold phase. If `shadcn init`, `bun add`, or
 * any other child process wedges past this limit, we kill it and fail
 * the scaffold loudly. A hung `create-vite` prompt used to stall the
 * whole pipeline for the lifetime of the dev server — never again.
 */
const PHASE_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Deterministic project name handed to `shadcn init --name`. shadcn's
 * `--yes` does NOT cover the create-vite "What is your project named?"
 * prompt, so we supply the answer as a flag instead of piping stdin.
 * The value itself is irrelevant — Phase 3 (`flattenSingleChildProject`)
 * moves the scaffold into the actual `repositoryPath`, and the chosen
 * name never leaks into the user's `package.json` because our template
 * overlay (Phase 5) doesn't rewrite the package.json name field.
 */
const SHADCN_PROJECT_NAME = 'vite-app';

/**
 * Bump this whenever the shadcn preset, extra deps, or base template
 * changes in a way that requires a fresh scaffold. Old cache dirs are
 * left in place (not deleted) so a rollback is always possible.
 */
const SCAFFOLD_CACHE_VERSION = 'v1';

/** Entries to exclude when saving the scaffold output to cache. */
const CACHE_SKIP = new Set(['.git', 'node_modules']);

@injectable()
export class BunShadcnScaffolder implements IApplicationScaffolder {
  async scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
    const { repositoryPath, onLog } = options;
    const emit = (level: 'Info' | 'Warn' | 'Error', message: string, detail?: string): void => {
      if (!onLog) return;
      try {
        onLog({ level, message, detail });
      } catch {
        // Sink failures must never abort a successful scaffold.
      }
    };

    emit('Info', 'Starting application setup', `Project: ${options.projectName}`);

    // Phase 1 — bootstrap bun on first-ever run.
    emit('Info', 'Checking bun is available');
    this.ensureBunOnPath(emit);

    // Phase 2 — base project files.
    //
    // FAST PATH (cache hit): The scaffold output from a previous run is
    // stored at ~/.shep/cache/scaffold/<version>/ (source files + lockfile,
    // no node_modules). We copy those files in and run
    // `bun install --frozen-lockfile`, which is fast because bun's global
    // package cache already has every package from the last run.
    //
    // SLOW PATH (cache miss): Run `bunx shadcn@latest init` in a temp
    // directory, move the result into repositoryPath, flatten, then save
    // (without node_modules) to the cache for next time.
    this.emptyDirectory(repositoryPath);

    if (this.isCacheValid()) {
      emit('Info', 'Using cached scaffold', 'Running `bun install --frozen-lockfile`');
      this.copyDirectory(this.getCacheDir(), repositoryPath);
      await this.runSpawn({
        command: 'bun',
        args: ['install', '--frozen-lockfile'],
        cwd: repositoryPath,
        phase: 'bun install (from scaffold cache)',
        timeoutMs: PHASE_TIMEOUT_MS,
        onLog: emit,
      });
    } else {
      emit(
        'Info',
        'Scaffolding from scratch',
        'First-run — running `bunx shadcn@latest init` (this can take a few minutes)'
      );
      // Run shadcn init in an OS-level scratch directory.
      const scratchDir = mkdtempSync(join(tmpdir(), 'shep-scaffold-'));
      try {
        await this.runSpawn({
          command: 'bunx',
          args: [
            '--bun',
            'shadcn@latest',
            'init',
            '--preset',
            'b0',
            '--base',
            'base',
            '--template',
            'vite',
            '--name',
            SHADCN_PROJECT_NAME,
            '--yes',
          ],
          cwd: scratchDir,
          phase: 'shadcn init',
          stdinInput: '\n'.repeat(20),
          timeoutMs: PHASE_TIMEOUT_MS,
          onLog: emit,
        });

        const scaffoldRoot = this.findScaffoldRoot(scratchDir);
        this.moveDirectoryContents(scaffoldRoot, repositoryPath);
      } finally {
        try {
          rmSync(scratchDir, { recursive: true, force: true });
        } catch {
          // Best-effort — the OS will eventually reap os.tmpdir().
        }
      }

      // Defensive flatten in case shadcn produced a nested layout.
      flattenSingleChildProject(repositoryPath);

      // Persist scaffold output for future fast-path runs.
      // Excludes node_modules and .git — only source files + lockfile.
      this.saveToCache(repositoryPath);
    }

    // Phase 4 — install the app-specific extras the "components"
    // step will import. Batched into one `bun add` call.
    emit('Info', 'Installing app dependencies', APP_EXTRA_DEPS.join(', '));
    await this.runSpawn({
      command: 'bun',
      args: ['add', ...APP_EXTRA_DEPS],
      cwd: repositoryPath,
      phase: 'bun add extras',
      timeoutMs: PHASE_TIMEOUT_MS,
      onLog: emit,
    });

    // Phase 5 — overlay the fat template on top of the raw scaffold.
    emit('Info', 'Applying Shep base template');
    const overlay = applyTemplateOverlay(repositoryPath);

    emit(
      'Info',
      'Application setup complete',
      `${overlay.templateFiles.length} template file(s) applied`
    );
    return {
      repositoryPath,
      templateFiles: overlay.templateFiles,
      templateVersion: overlay.templateVersion,
    };
  }

  /**
   * Check `bun --version`. On failure, install bun globally via
   * `npm install -g bun` and verify again. Runs synchronously because
   * the whole scaffold pipeline must block on a working bun.
   */
  private ensureBunOnPath(
    emit: (level: 'Info' | 'Warn' | 'Error', message: string, detail?: string) => void
  ): void {
    if (this.hasBun()) return;

    emit('Warn', 'bun not on PATH — installing via `npm install -g bun`');
    // eslint-disable-next-line no-console
    console.log('[bun-shadcn-scaffolder] bun not on PATH — installing via `npm install -g bun`');
    const install = spawnSync('npm', ['install', '-g', 'bun'], {
      stdio: 'inherit',
      shell: IS_WINDOWS,
      windowsHide: IS_WINDOWS,
    });
    if (install.status !== 0) {
      throw new Error(
        `bun bootstrap failed: \`npm install -g bun\` exited with code ${install.status}. ` +
          `Install bun manually from https://bun.sh and retry.`
      );
    }

    if (!this.hasBun()) {
      throw new Error(
        'bun bootstrap failed: `npm install -g bun` succeeded but `bun --version` still errors. ' +
          'The bun binary may not be on PATH for this shell.'
      );
    }
    emit('Info', 'bun installed');
  }

  /**
   * Remove every entry inside `dirPath` without removing the directory
   * itself. Idempotent and cross-platform — uses `fs.rmSync(..., {
   * recursive, force })` per entry instead of `fs.rm` on the parent so
   * we don't delete the directory the caller is about to write into.
   *
   * Called before moving the scaffolded output from the temp scratch
   * directory so the target path starts clean. Anything
   * `FsProjectScaffoldService` pre-created (currently a `.git/`
   * directory + first commit) is wiped — the workflow `commit` step
   * re-initializes git itself, so nothing downstream depends on the
   * pre-existing repo.
   */
  // ── Scaffold cache helpers ───────────────────────────────────────────

  /** Absolute path to the versioned scaffold cache directory. */
  private getCacheDir(): string {
    return join(getShepHomeDir(), 'cache', 'scaffold', SCAFFOLD_CACHE_VERSION);
  }

  /** True when the cache directory contains a valid `package.json`. */
  private isCacheValid(): boolean {
    return existsSync(join(this.getCacheDir(), 'package.json'));
  }

  /**
   * Persist scaffold source files to the cache, skipping `node_modules`
   * and `.git` — only source files and the lockfile are needed.
   */
  private saveToCache(sourceDir: string): void {
    const cacheDir = this.getCacheDir();
    mkdirSync(cacheDir, { recursive: true });
    this.copyDirectory(sourceDir, cacheDir);
  }

  /**
   * Recursively copy every entry from `srcDir` to `destDir`,
   * skipping entries listed in `CACHE_SKIP`.
   */
  private copyDirectory(srcDir: string, destDir: string): void {
    mkdirSync(destDir, { recursive: true });
    for (const entry of readdirSync(srcDir)) {
      if (CACHE_SKIP.has(entry)) continue;
      cpSync(join(srcDir, entry), join(destDir, entry), { recursive: true });
    }
  }

  // ────────────────────────────────────────────────────────────────────

  private emptyDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) return;
    for (const entry of readdirSync(dirPath)) {
      rmSync(join(dirPath, entry), { recursive: true, force: true });
    }
  }

  /**
   * Resolve the directory inside `scratchDir` that actually contains
   * the scaffolded project. Handles both layouts shadcn might produce:
   *
   *   1. FLAT — `scratchDir/package.json` exists. Return `scratchDir`.
   *   2. SUBDIR — exactly one child directory under `scratchDir`
   *      contains `package.json`. Return that child.
   *
   * Throws with a clear message when the layout is ambiguous (no
   * `package.json` anywhere, or multiple candidate children) so we
   * don't silently ship a broken scaffold into the user's project.
   */
  private findScaffoldRoot(scratchDir: string): string {
    if (existsSync(join(scratchDir, 'package.json'))) {
      return scratchDir;
    }

    const entries = readdirSync(scratchDir);
    const candidates: string[] = [];
    for (const entry of entries) {
      const entryPath = join(scratchDir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(entryPath).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      if (existsSync(join(entryPath, 'package.json'))) {
        candidates.push(entryPath);
      }
    }

    if (candidates.length === 0) {
      throw new Error(
        `findScaffoldRoot: no package.json found in scratch directory "${scratchDir}" ` +
          `or any immediate child — shadcn init did not produce a recognizable project.`
      );
    }
    if (candidates.length > 1) {
      throw new Error(
        `findScaffoldRoot: multiple candidate scaffold roots in "${scratchDir}" ` +
          `(${candidates.map((p) => p.slice(scratchDir.length + 1)).join(', ')}) — ` +
          `shadcn init layout is ambiguous.`
      );
    }

    return candidates[0]!;
  }

  /**
   * Move every entry from `srcDir` into `destDir`, preserving dotfiles.
   * `destDir` must be empty (call `emptyDirectory` first). Uses
   * `fs.renameSync` so the move is atomic on POSIX and cheap on
   * Windows — source and destination live on the same filesystem
   * (both under `/tmp` and the Shep home dir, which are usually the
   * same mount point).
   *
   * If rename fails with EXDEV (cross-device), falls back to a
   * recursive copy + delete so the adapter still works when `/tmp`
   * is on a different filesystem than the Shep home directory
   * (common on Linux where `/tmp` is often `tmpfs`).
   */
  private moveDirectoryContents(srcDir: string, destDir: string): void {
    for (const entry of readdirSync(srcDir)) {
      const from = join(srcDir, entry);
      const to = join(destDir, entry);
      try {
        renameSync(from, to);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EXDEV') {
          // Cross-device rename — fall back to recursive copy + delete.
          // Happens when /tmp is on a different filesystem than the
          // Shep home dir (common on Linux where /tmp is often tmpfs).
          cpSync(from, to, { recursive: true, errorOnExist: true });
          rmSync(from, { recursive: true, force: true });
        } else {
          throw err;
        }
      }
    }
  }

  private hasBun(): boolean {
    const check = spawnSync('bun', ['--version'], {
      stdio: 'ignore',
      shell: IS_WINDOWS,
      windowsHide: IS_WINDOWS,
    });
    return check.status === 0;
  }

  /**
   * Run a command to completion. Pipes stdout/stderr so progress lines
   * can be tee'd to both the parent process's stdout/stderr (so the
   * dev server log still shows live progress) AND to `onLog` (so the
   * UI's operation-log drawer streams the same content).
   *
   * When `stdinInput` is set, a piped stdin is attached and the string
   * is written to it up front, then closed — used as a safety net for
   * interactive prompts that slip past `--yes`.
   *
   * When `timeoutMs` is set, the child is killed with SIGKILL (or
   * taskkill on Windows) if it hasn't exited before the deadline.
   * This is a hard ceiling: any hang — stuck interactive prompt,
   * network stall inside `bunx`, broken registry mirror — fails the
   * scaffold loudly instead of wedging the Shep process forever.
   *
   * Throws on non-zero exit, spawn error, or timeout.
   */
  private runSpawn(args: {
    command: string;
    args: string[];
    cwd: string;
    phase: string;
    stdinInput?: string;
    timeoutMs?: number;
    onLog?: (level: 'Info' | 'Warn' | 'Error', message: string, detail?: string) => void;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const pipeStdin = args.stdinInput !== undefined;
      const emit =
        args.onLog ??
        ((): void => {
          /* no-op default when caller does not subscribe to log events */
        });
      emit('Info', `▶ ${args.phase}`, `${args.command} ${args.args.join(' ')}`);

      // Always pipe stdout/stderr — we forward the bytes to the parent
      // process (preserving the live terminal experience) AND also
      // feed a line buffer that sends each emitted line to the UI log.
      const child = spawn(args.command, args.args, {
        cwd: args.cwd,
        stdio: [pipeStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        // Windows needs `shell: true` to resolve `.cmd` shims for
        // `bun`, `bunx`, and `npm`. POSIX does not and benefits from
        // direct exec (no argument escaping).
        shell: IS_WINDOWS,
        windowsHide: IS_WINDOWS,
      });

      const stdoutBuf = new LineBuffer((line) => emit('Info', line));
      const stderrBuf = new LineBuffer((line) => emit('Warn', line));
      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          process.stdout.write(chunk);
          stdoutBuf.write(chunk.toString('utf8'));
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          process.stderr.write(chunk);
          stderrBuf.write(chunk.toString('utf8'));
        });
      }

      // Hard timeout — SIGKILL after `timeoutMs` with no exit event.
      // On Windows `child.kill('SIGKILL')` translates to TerminateProcess
      // via libuv, which is the equivalent of `taskkill /F`.
      let timedOut = false;
      const timeoutHandle =
        args.timeoutMs !== undefined
          ? setTimeout(() => {
              timedOut = true;
              try {
                child.kill('SIGKILL');
              } catch {
                // Best effort — the child may have already exited.
              }
            }, args.timeoutMs)
          : null;
      const clearTimer = (): void => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };

      if (pipeStdin && child.stdin) {
        // Write the canned answer up front, then close stdin so the
        // child receives EOF on its next `readline`. If a tool ever
        // blocks waiting for more input, the EOF unblocks it with a
        // default response.
        child.stdin.on('error', () => {
          // Ignore EPIPE — the child may have already chosen its
          // default and closed stdin before we finish writing.
        });
        child.stdin.write(args.stdinInput!);
        child.stdin.end();
      }
      child.on('error', (err) => {
        clearTimer();
        stdoutBuf.flush();
        stderrBuf.flush();
        emit('Error', `${args.phase} failed to start`, err.message);
        reject(
          new Error(
            `${args.phase} failed to start: ${err.message}. ` +
              `Command: ${args.command} ${args.args.join(' ')}`
          )
        );
      });
      child.on('exit', (code, signal) => {
        clearTimer();
        stdoutBuf.flush();
        stderrBuf.flush();
        if (timedOut) {
          emit(
            'Error',
            `${args.phase} timed out`,
            `Killed after ${args.timeoutMs}ms. Command: ${args.command} ${args.args.join(' ')}`
          );
          reject(
            new Error(
              `${args.phase} timed out after ${args.timeoutMs}ms and was killed. ` +
                `Command: ${args.command} ${args.args.join(' ')}`
            )
          );
          return;
        }
        if (code === 0) {
          emit('Info', `✓ ${args.phase} done`);
          resolve();
        } else {
          emit(
            'Error',
            `${args.phase} exited with ${code ?? `signal ${signal}`}`,
            `Command: ${args.command} ${args.args.join(' ')}`
          );
          reject(
            new Error(
              `${args.phase} exited with ${code ?? `signal ${signal}`}. ` +
                `Command: ${args.command} ${args.args.join(' ')}`
            )
          );
        }
      });
    });
  }
}
