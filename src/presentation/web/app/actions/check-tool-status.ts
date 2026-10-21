'use server';

import { execFile } from 'node:child_process';
import { IS_WINDOWS } from '@shepai/core/infrastructure/platform';
import { resolve } from '@/lib/server-container';
import type { ListToolsUseCase } from '@shepai/core/application/use-cases/tools/list-tools.use-case';

export interface ToolStatusEntry {
  installed: boolean;
  version: string | null;
  /** Platform-specific install command from tool JSON metadata */
  installCommand: string | null;
  /** Documentation/website URL */
  installUrl: string | null;
}

export interface ToolStatusResult {
  git: ToolStatusEntry;
  gh: ToolStatusEntry;
}

/** errno code execFile reports when the command is not on PATH. */
const BINARY_NOT_FOUND_CODE = 'ENOENT';

function getVersion(
  command: string,
  args: string[]
): Promise<{ installed: boolean; version: string | null }> {
  return new Promise((resolve) => {
    try {
      const opts = IS_WINDOWS ? { timeout: 5000, windowsHide: true } : { timeout: 5000 };
      execFile(command, args, opts, (error, stdout) => {
        if (error) {
          // Only a missing binary means "not installed". A binary that exists but
          // fails (unreadable config dir in Docker, non-zero exit, timeout) is
          // installed — its version is just unknown.
          const installed = (error as NodeJS.ErrnoException).code !== BINARY_NOT_FOUND_CODE;
          resolve({ installed, version: null });
          return;
        }
        // Extract version number from output like "git version 2.43.0" or "gh version 2.40.1"
        const match = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
        resolve({ installed: true, version: match?.[1] ?? null });
      });
    } catch {
      resolve({ installed: false, version: null });
    }
  });
}

export async function checkToolStatus(): Promise<ToolStatusResult> {
  // Run version checks and tool metadata lookup in parallel
  const [gitVersion, ghVersion, tools] = await Promise.all([
    getVersion('git', ['--version']),
    getVersion('gh', ['--version']),
    (async () => {
      try {
        const useCase = resolve<ListToolsUseCase>('ListToolsUseCase');
        return await useCase.execute();
      } catch {
        return [];
      }
    })(),
  ]);

  const gitTool = tools.find((t) => t.id === 'git');
  const ghTool = tools.find((t) => t.id === 'gh');

  return {
    git: {
      ...gitVersion,
      installCommand: gitTool?.installCommand ?? null,
      installUrl: gitTool?.website ?? 'https://git-scm.com',
    },
    gh: {
      ...ghVersion,
      installCommand: ghTool?.installCommand ?? null,
      installUrl: ghTool?.website ?? 'https://cli.github.com',
    },
  };
}
