'use server';

import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { computeWorktreePath } from '@shepai/core/infrastructure/services/ide-launchers/compute-worktree-path';
import { resolve } from '@/lib/server-container';
import type { IToolInstallerService } from '@shepai/core/application/ports/output/services/tool-installer.service';

// Escape a path for embedding inside an AppleScript string literal:
// only backslashes and double-quotes need escaping for AppleScript text.
function escapeAppleScript(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Escape a path for embedding inside a single-quoted POSIX shell string used
// inside `cd ...` so spaces and shell metacharacters don't break the cd.
function escapePosixSingleQuote(p: string): string {
  return p.replace(/'/g, `'\\''`);
}

// Fallback commands for the "system" terminal when no tool metadata entry exists.
// Uses a record lookup instead of if/else to prevent the bundler from
// tree-shaking platform branches at build time. Turbopack evaluates
// os.platform() during the build and dead-code-eliminates unused branches,
// baking in the CI platform (linux) and breaking macOS/Windows installs.
//
// On macOS, `open -a Terminal /path` is unreliable: when Terminal.app is
// already running, the new window can land in $HOME instead of the supplied
// path. Use osascript with `do script "cd ..."` so we explicitly cd into the
// target — see issue #583.
const SYSTEM_TERMINAL_COMMANDS: Record<string, { cmd: string; args: (path: string) => string[] }> =
  {
    darwin: {
      cmd: 'osascript',
      args: (p) => [
        '-e',
        `tell application "Terminal" to do script "cd '${escapePosixSingleQuote(escapeAppleScript(p))}'; clear"`,
        '-e',
        'tell application "Terminal" to activate',
      ],
    },
    linux: { cmd: 'x-terminal-emulator', args: (p) => [`--working-directory=${p}`] },
    win32: {
      cmd: 'cmd.exe',
      args: (p) => ['/c', 'start', 'powershell', '-NoExit', '-Command', `Set-Location "${p}"`],
    },
  };

interface OpenShellInput {
  repositoryPath: string;
  branch?: string;
}

export async function openShell(
  input: OpenShellInput
): Promise<{ success: boolean; error?: string; path?: string; shell?: string }> {
  const { repositoryPath, branch } = input;

  if (!repositoryPath || !isAbsolute(repositoryPath)) {
    return { success: false, error: 'repositoryPath must be an absolute path' };
  }

  try {
    const settings = getSettings();
    const shell = settings.environment.shellPreference;
    const terminalPref = settings.environment.terminalPreference ?? 'system';
    const targetPath = branch ? computeWorktreePath(repositoryPath, branch) : repositoryPath;

    if (!existsSync(targetPath)) {
      return { success: false, error: `Path does not exist: ${targetPath}` };
    }

    // Try to find the terminal in tool metadata via DI container.
    // Using DI (not a direct import from tool-metadata) ensures that
    // TOOL_METADATA is read from the correct tools/ directory path — it is loaded once
    // in the Node.js CLI bootstrap context where import.meta.url resolves correctly.
    // Direct imports of tool-metadata break in standalone production builds.
    if (terminalPref !== 'system') {
      try {
        const service = resolve<IToolInstallerService>('IToolInstallerService');
        const config = service.getTerminalOpenConfig(terminalPref);

        if (config?.openDirectory.includes('{dir}')) {
          if (config.shell) {
            // shell:true accepts a single command string and lets the OS shell
            // parse quoting — replace {dir} with a quoted path so spaces work.
            const quoted =
              platform() === 'win32'
                ? `"${targetPath}"`
                : `'${escapePosixSingleQuote(targetPath)}'`;
            const resolved = config.openDirectory.replace('{dir}', quoted);
            const child = spawn(resolved, [], {
              detached: true,
              stdio: 'ignore',
              shell: true,
            });
            child.on('error', () => undefined);
            child.unref();
          } else {
            // Tokenize the TEMPLATE first (which has no spaces in {dir}),
            // then substitute the literal path into the matching arg. This
            // preserves paths with spaces — splitting after substitution
            // would shred them into multiple args.
            const tokens = config.openDirectory.split(/\s+/).filter(Boolean);
            const [command, ...rest] = tokens;
            const args = rest.map((tok) => tok.replace('{dir}', targetPath));
            const child = spawn(command, args, {
              detached: true,
              stdio: 'ignore',
            });
            child.on('error', () => undefined);
            child.unref();
          }

          return { success: true, path: targetPath, shell };
        }
      } catch {
        // DI container not available — fall through to system terminal
      }
    }

    // Fallback to system terminal
    const entry = SYSTEM_TERMINAL_COMMANDS[platform()];
    if (!entry) {
      return {
        success: false,
        error: `Unsupported platform: ${platform()}`,
      };
    }

    const child = spawn(entry.cmd, entry.args(targetPath), {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => undefined); // Prevent uncaught exception on spawn failure
    child.unref();

    return { success: true, path: targetPath, shell };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to open shell';
    return { success: false, error: message };
  }
}
