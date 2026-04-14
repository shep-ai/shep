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
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { injectable } from 'tsyringe';
import type {
  IApplicationScaffolder,
  ScaffoldOptions,
  ScaffoldResult,
} from '../../../application/ports/output/services/application-scaffolder.interface.js';
import { flattenSingleChildProject } from './flatten-subdirectory.js';
import { applyTemplateOverlay } from './template-overlay.js';

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

@injectable()
export class BunShadcnScaffolder implements IApplicationScaffolder {
  async scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
    const { repositoryPath } = options;

    // Phase 1 — bootstrap bun on first-ever run.
    this.ensureBunOnPath();

    // Phase 2 — run shadcn init inside an OS-level scratch directory
    // instead of directly inside `repositoryPath`.
    //
    // BACKGROUND: earlier attempts to scaffold directly into
    // `repositoryPath` kept producing a `vite-app/` subdirectory
    // despite `--name`, `--cwd`, and even emptying the target first.
    // The exact reason is opaque — `shadcn init --template vite` may
    // write shadcn-specific files (`components.json`, etc.) at the
    // given cwd AND run `create-vite` in a child folder named after
    // `--name`, mixing the two layouts. Our flatten helper then
    // early-returned because there was already a `package.json` at
    // the root, leaving `vite-app/` in place.
    //
    // NEW STRATEGY — zero trust in shadcn's cwd behavior:
    //   1. Create a fresh temp directory (`os.tmpdir()/shep-scaffold-*`).
    //   2. Run shadcn init inside it.
    //   3. Find the single scaffolded project root — either the temp
    //      dir itself (if shadcn scaffolded flat) or a unique child
    //      with a `package.json` (if shadcn insisted on a subdir).
    //   4. Empty `repositoryPath` and `fs.renameSync` every file from
    //      the scaffold root into `repositoryPath`.
    //   5. Remove the temp directory.
    //
    // This eliminates the subdir class of bug forever: whatever
    // shadcn produces, we only copy the useful subtree into the real
    // project path. The final `repositoryPath` layout is 100% under
    // our control.
    const scratchDir = mkdtempSync(join(tmpdir(), 'shep-scaffold-'));
    try {
      // CRITICAL: `--template vite` drives `create-vite`, and `--yes`
      // does NOT cover the "What is your project named?" prompt. We
      // answer it via `--name` instead of piping stdin — stdin piping
      // is unreliable because many prompt libraries detect non-TTY
      // input and ignore it, leading to indefinite hangs. The chosen
      // name is irrelevant: the move step below ignores it.
      //
      // `stdinInput` newlines remain as a defensive safety net in
      // case a future shadcn version adds a new prompt we didn't
      // anticipate — combined with the 3-minute phase timeout
      // (runSpawn), the child can never hang longer than that.
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
      });

      // Phase 3 — locate the scaffolded project root inside the
      // scratch directory, then move every file into repositoryPath.
      const scaffoldRoot = this.findScaffoldRoot(scratchDir);
      this.emptyDirectory(repositoryPath);
      this.moveDirectoryContents(scaffoldRoot, repositoryPath);
    } finally {
      // Always clean up the scratch dir, even if the move failed —
      // otherwise /tmp fills up with half-scaffolded projects.
      try {
        rmSync(scratchDir, { recursive: true, force: true });
      } catch {
        // Best-effort — the OS will eventually reap os.tmpdir().
      }
    }

    // Phase 3b — defensive flatten. If `moveDirectoryContents` ever
    // leaves a stray `vite-app/` child (e.g. due to a future shadcn
    // quirk we haven't accounted for), the flatten helper catches it
    // as a safety net.
    flattenSingleChildProject(repositoryPath);

    // Phase 4 — install the app-specific extras the "components"
    // step will import. Batched into one `bun add` call.
    await this.runSpawn({
      command: 'bun',
      args: ['add', ...APP_EXTRA_DEPS],
      cwd: repositoryPath,
      phase: 'bun add extras',
      timeoutMs: PHASE_TIMEOUT_MS,
    });

    // Phase 5 — overlay the fat template on top of the raw scaffold.
    //   - Ships the dark-mode palette already configured in index.css.
    //   - Ships pre-built common/ components the agent imports.
    //   - Ships lib/ helpers (theme, format, mock) and types/common.ts.
    //   - Ships TEMPLATE.md at the root so the agent's first turn reads
    //     it and knows what's available.
    const overlay = applyTemplateOverlay(repositoryPath);

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
  private ensureBunOnPath(): void {
    if (this.hasBun()) return;

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
   * Run a command to completion. Stdout and stderr inherit so the
   * user sees progress in the terminal (for CLI invocations) and the
   * Shep log (for web-app invocations). When `stdinInput` is set, a
   * piped stdin is attached and the string is written to it up front,
   * then closed — used as a safety net for interactive prompts that
   * slip past `--yes`.
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
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const pipeStdin = args.stdinInput !== undefined;
      const child = spawn(args.command, args.args, {
        cwd: args.cwd,
        // When we need to feed stdin, we MUST pipe it — inheriting
        // from the parent would tie the child to whatever stdin the
        // Shep process has (usually the dev server's TTY or /dev/null
        // in production) and the interactive prompt would still hang.
        stdio: pipeStdin ? ['pipe', 'inherit', 'inherit'] : 'inherit',
        // Windows needs `shell: true` to resolve `.cmd` shims for
        // `bun`, `bunx`, and `npm`. POSIX does not and benefits from
        // direct exec (no argument escaping).
        shell: IS_WINDOWS,
        windowsHide: IS_WINDOWS,
      });

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
        reject(
          new Error(
            `${args.phase} failed to start: ${err.message}. ` +
              `Command: ${args.command} ${args.args.join(' ')}`
          )
        );
      });
      child.on('exit', (code, signal) => {
        clearTimer();
        if (timedOut) {
          reject(
            new Error(
              `${args.phase} timed out after ${args.timeoutMs}ms and was killed. ` +
                `Command: ${args.command} ${args.args.join(' ')}`
            )
          );
          return;
        }
        if (code === 0) {
          resolve();
        } else {
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
