/**
 * shep fleet triage
 *
 * Surfaces actionable exceptions requiring human attention across the fleet,
 * organized by priority (P1 blockers, P2 failures, P3 warnings).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListFleetTriageItemsUseCase } from '@/application/use-cases/fleet/list-fleet-triage-items.use-case.js';
import { FleetTriagePriority } from '@/domain/generated/output.js';
import { colors, fmt, messages } from '../../ui/index.js';

export function createTriageCommand(): Command {
  return new Command('triage')
    .description('List actionable exceptions across the fleet requiring human decision')
    .option('--repo <path>', 'Filter triage items to a specific repository path')
    .action(async (options: { repo?: string }) => {
      try {
        const useCase = container.resolve(ListFleetTriageItemsUseCase);
        const items = await useCase.execute({ repositoryPath: options.repo });

        messages.newline();
        if (items.length === 0) {
          messages.success('Fleet is healthy — 0 items requiring attention!');
          messages.newline();
          return;
        }

        console.log(
          `  ${colors.brand(`=== Fleet Triage Feed (${items.length} actionable items) ===`)}`
        );
        messages.newline();

        for (const item of items) {
          let priorityTag = `[${item.priority}]`;
          if (item.priority === FleetTriagePriority.p1) {
            priorityTag = colors.error(priorityTag);
          } else if (item.priority === FleetTriagePriority.p2) {
            priorityTag = colors.warning(priorityTag);
          } else {
            priorityTag = colors.muted(priorityTag);
          }

          console.log(
            `  ${priorityTag} ${fmt.bold(item.featureName)} (${colors.muted(item.slug)})`
          );
          console.log(`       ${colors.muted('Reason:')}   ${item.reason}`);
          if (item.gateType) {
            console.log(`       ${colors.muted('Gate:')}     ${colors.info(item.gateType)}`);
            console.log(`       ${colors.muted('Action:')}   shep feat approve ${item.slug}`);
          }
          console.log();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to retrieve fleet triage items', err);
        process.exitCode = 1;
      }
    });
}
