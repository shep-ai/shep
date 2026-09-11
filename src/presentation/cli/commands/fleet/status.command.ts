/**
 * shep fleet status
 *
 * Displays aggregate health and status counts across the fleet:
 * cruising, queued, attention needed, and the circuit breaker condition.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetFleetOverviewUseCase } from '@/application/use-cases/fleet/get-fleet-overview.use-case.js';
import { colors, fmt, messages, symbols } from '../../ui/index.js';

/** Renders a count, dimmed when it is zero. */
function renderCount(value: number, format: (text: string) => string): string {
  return value > 0 ? format(String(value)) : colors.muted('0');
}

export function createStatusCommand(): Command {
  return new Command('status')
    .description('Display aggregate health and status across the agent fleet')
    .option('--repo <path>', 'Filter fleet to a specific repository path')
    .action(async (options: { repo?: string }) => {
      try {
        const useCase = container.resolve(GetFleetOverviewUseCase);
        const overview = await useCase.execute(options.repo);

        const { total, cruising, queued, attentionNeeded, failed } = overview.counts;

        messages.newline();
        console.log(`  ${colors.brand('=== Shep Fleet Health ===')}`);
        console.log(`  Total Features:     ${fmt.bold(String(total))}`);
        console.log(
          `  ${colors.success(symbols.success)} Cruising:          ${renderCount(cruising, colors.success)}`
        );
        console.log(
          `  ${colors.info(symbols.bullet)} Queued:            ${renderCount(queued, colors.info)}`
        );
        console.log(
          `  ${attentionNeeded > 0 ? colors.warning(symbols.warning) : colors.muted(symbols.dotEmpty)} Attention Needed:  ${renderCount(attentionNeeded, colors.warning)}`
        );
        console.log(
          `  ${failed > 0 ? colors.error(symbols.error) : colors.muted(symbols.dotEmpty)} Failed:            ${renderCount(failed, colors.error)}`
        );

        messages.newline();
        if (overview.circuitBreakerTripped) {
          console.log(
            `  ${colors.error(symbols.error)} ${fmt.bold('Circuit Breaker:')} ${colors.error('TRIPPED')}`
          );
          console.log(
            `    ${colors.muted(overview.circuitBreakerReason ?? 'Failure thresholds exceeded')}`
          );
          console.log(
            `    ${colors.muted('Recent agent runs are failing repeatedly — run `shep fleet triage` to inspect them.')}`
          );
        } else {
          console.log(
            `  ${colors.success(symbols.success)} ${fmt.bold('Circuit Breaker:')} ${colors.success('Normal')}`
          );
        }
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to retrieve fleet status', err);
        process.exitCode = 1;
      }
    });
}
