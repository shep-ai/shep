/**
 * shep fleet pause / resume
 *
 * The manual lever on the admission queue. `pause` parks new work (running
 * agents are untouched — the cap and the pause both govern admission only), and
 * `resume` lets the queue drain again.
 *
 * `resume` is also the ONLY way to clear a pause the circuit breaker set. The
 * breaker deliberately cannot clear its own pause: a fleet that tripped while
 * the user was asleep would otherwise restart into the same failing conditions
 * the moment the rolling window happened to look healthy.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { SetFleetQueuePauseUseCase } from '@/application/use-cases/fleet/set-fleet-queue-pause.use-case.js';
import { colors, messages } from '../../ui/index.js';

export function createPauseCommand(): Command {
  return new Command('pause')
    .description('Pause the fleet admission queue — new work is parked, running agents continue')
    .option('--reason <text>', 'Why the queue is being paused, recorded and shown by fleet status')
    .action(async (options: { reason?: string }) => {
      try {
        const useCase = container.resolve(SetFleetQueuePauseUseCase);
        const pause = await useCase.execute({ paused: true, reason: options.reason });

        messages.newline();
        messages.success('Fleet admission queue paused.');
        if (pause) {
          console.log(`  ${colors.muted(pause.reason)}`);
        }
        console.log(
          `  ${colors.muted('Running agents are unaffected. Queued features keep their place.')}`
        );
        console.log(`  ${colors.muted('Run `shep fleet resume` to start admitting again.')}`);
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to pause the fleet admission queue', err);
        process.exitCode = 1;
      }
    });
}

export function createResumeCommand(): Command {
  return new Command('resume')
    .description('Resume the fleet admission queue and admit whatever now has room')
    .action(async () => {
      try {
        const useCase = container.resolve(SetFleetQueuePauseUseCase);
        await useCase.execute({ paused: false });

        messages.newline();
        messages.success('Fleet admission queue resumed.');
        console.log(
          `  ${colors.muted('Queued features are admitted in FIFO order as capacity allows.')}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to resume the fleet admission queue', err);
        process.exitCode = 1;
      }
    });
}
