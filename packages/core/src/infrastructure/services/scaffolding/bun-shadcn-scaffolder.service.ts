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
import { existsSync, readdirSync, rmSync } from 'node:fs';
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

    // Phase 1 — bootstrap bun on first-ever run
    this.ensureBunOnPath();

    // Phase 2a — empty the target directory before running shadcn init.
    //
    // `CreateProjectUseCase` -> `FsProjectScaffoldService.scaffoldProject`
    // runs `git init` + an empty commit on the folder BEFORE we get
    // here, which leaves a `.git/` directory in place. That alone is
    // enough to make `create-vite` decide the target "is not empty"
    // and either prompt with "remove existing files and continue?" or
    // silently fall back to creating a child folder. Wiping everything
    // under `repositoryPath` gives shadcn a pristine cwd. The workflow
    // `commit` step runs a fresh `git init` later, so nothing
    // downstream depends on the pre-existing repo.
    this.emptyDirectory(repositoryPath);

    // Phase 2b — scaffold the base project via shadcn b0 preset.
    //
    // `shadcn init --preset b0 --base base --template vite` installs
    // Vite + React + TypeScript + Tailwind + the shadcn base
    // components in a single command.
    //
    // CRITICAL: `--template vite` drives `create-vite`, and `--yes`
    // does NOT cover the "What is your project named?" prompt. We
    // answer it via `--name` instead of piping stdin — stdin piping
    // is unreliable because many prompt libraries detect non-TTY
    // input and ignore it, leading to indefinite hangs. The chosen
    // name is irrelevant: Phase 3 (`flattenSingleChildProject`)
    // flattens the scaffolded subdirectory into `repositoryPath`
    // regardless of what shadcn picks.
    //
    // `--cwd` is passed explicitly so shadcn resolves paths relative
    // to our target, independent of whatever cwd the Shep process is
    // running with.
    //
    // `stdinInput` newlines remain as a defensive safety net in case
    // a future shadcn version adds a new prompt we didn't anticipate —
    // combined with the 3-minute phase timeout (runSpawn), the child
    // can never hang longer than that.
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
        '--cwd',
        repositoryPath,
        '--yes',
      ],
      cwd: repositoryPath,
      phase: 'shadcn init',
      stdinInput: '\n'.repeat(20),
      timeoutMs: PHASE_TIMEOUT_MS,
    });

    // Phase 3 — flatten the child directory shadcn created.
    //
    // In practice shadcn creates `repositoryPath/vite-app/` because of
    // `--name`. `flattenSingleChildProject` is a synchronous
    // `fs.renameSync` walk that moves every file (including dotfiles)
    // from the single child directory up into `repositoryPath` and
    // removes the empty shell. It no-ops when there is already a
    // `package.json` at `repositoryPath` (meaning shadcn or a future
    // version scaffolded straight into cwd without a subdir).
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
   * we don't delete the directory `bunx` is about to chdir into.
   *
   * Called before `shadcn init` so the scaffold sees a truly empty
   * cwd regardless of what the upstream `FsProjectScaffoldService`
   * left behind (currently `.git/` + a first commit).
   */
  private emptyDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) return;
    for (const entry of readdirSync(dirPath)) {
      rmSync(join(dirPath, entry), { recursive: true, force: true });
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
