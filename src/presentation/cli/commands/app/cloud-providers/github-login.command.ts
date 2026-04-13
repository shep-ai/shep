/**
 * `shep app cloud-providers github-login`
 *
 * Uses EnsureGhAuthenticatedUseCase to check current gh CLI auth status.
 * If not authenticated, spawns `gh auth login --web` and waits for the
 * status to flip to authenticated (or until the user gives up).
 */

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { container } from '@/infrastructure/di/container.js';
import { EnsureGhAuthenticatedUseCase } from '@/application/use-cases/cloud-deploy/ensure-gh-authenticated.use-case.js';
import { colors, messages } from '../../../ui/index.js';

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function createGithubLoginCommand(): Command {
  return new Command('github-login')
    .description('Run `gh auth login --web` and wait for authentication to complete')
    .action(async () => {
      try {
        const useCase = container.resolve(EnsureGhAuthenticatedUseCase);

        const initial = await useCase.execute();
        if (initial.authenticated) {
          process.stdout.write(colors.success('✓ gh is already authenticated\n'));
          return;
        }

        process.stdout.write('Starting GitHub sign-in flow…\n');
        spawn('gh', ['auth', 'login', '--web'], {
          stdio: 'inherit',
          windowsHide: true,
        });

        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS);
          const { authenticated } = await useCase.execute();
          if (authenticated) {
            process.stdout.write(colors.success('\n✓ gh authenticated successfully\n'));
            return;
          }
        }

        messages.error('Timed out waiting for GitHub sign-in to complete');
        process.exitCode = 1;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('GitHub login flow failed', err);
        process.exitCode = 1;
      }
    });
}
