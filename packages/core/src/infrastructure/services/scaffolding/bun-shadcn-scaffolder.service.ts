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

@injectable()
export class BunShadcnScaffolder implements IApplicationScaffolder {
  async scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
    const { repositoryPath } = options;

    // Phase 1 — bootstrap bun on first-ever run
    this.ensureBunOnPath();

    // Phase 2 — scaffold the base project via shadcn b0 preset.
    //
    // `bunx --bun shadcn@latest init --preset b0 --base base --template
    //  vite --yes` is the single command that installs Vite + React +
    // TypeScript + Tailwind + the shadcn base components.
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
        '--yes',
      ],
      cwd: repositoryPath,
      phase: 'shadcn init',
    });

    // Phase 3 — flatten the child directory shadcn created.
    flattenSingleChildProject(repositoryPath);

    // Phase 4 — install the app-specific extras the "components"
    // step will import. Batched into one `bun add` call.
    await this.runSpawn({
      command: 'bun',
      args: ['add', ...APP_EXTRA_DEPS],
      cwd: repositoryPath,
      phase: 'bun add extras',
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

  private hasBun(): boolean {
    const check = spawnSync('bun', ['--version'], {
      stdio: 'ignore',
      shell: IS_WINDOWS,
      windowsHide: IS_WINDOWS,
    });
    return check.status === 0;
  }

  /**
   * Run a command to completion, inheriting stdio so the user sees
   * progress in the terminal (for CLI invocations) and the Shep log
   * (for web-app invocations). Throws on non-zero exit.
   */
  private runSpawn(args: {
    command: string;
    args: string[];
    cwd: string;
    phase: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(args.command, args.args, {
        cwd: args.cwd,
        stdio: 'inherit',
        // Windows needs `shell: true` to resolve `.cmd` shims for
        // `bun`, `bunx`, and `npm`. POSIX does not and benefits from
        // direct exec (no argument escaping).
        shell: IS_WINDOWS,
        windowsHide: IS_WINDOWS,
      });
      child.on('error', (err) => {
        reject(
          new Error(
            `${args.phase} failed to start: ${err.message}. ` +
              `Command: ${args.command} ${args.args.join(' ')}`
          )
        );
      });
      child.on('exit', (code, signal) => {
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
