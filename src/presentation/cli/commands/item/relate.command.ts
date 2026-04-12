/**
 * Item Relate Command
 *
 * Create a relation between two work items.
 *
 * Usage:
 *   shep item relate <source> <target> --type blocking
 *   shep item relate PROJ-1 PROJ-2 --type relates-to
 */

import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { GetWorkItemUseCase } from '@/application/use-cases/work-items/get-work-item.use-case.js';
import { CreateWorkItemRelationUseCase } from '@/application/use-cases/work-item-relations/create-work-item-relation.use-case.js';
import { colors, messages } from '../../ui/index.js';

const RELATION_TYPE_CHOICES = [
  { name: 'Blocking', value: 'Blocking' },
  { name: 'Relates To', value: 'RelatesTo' },
  { name: 'Duplicate', value: 'Duplicate' },
  { name: 'Starts Before', value: 'StartsBefore' },
  { name: 'Finishes Before', value: 'FinishesBefore' },
];

const RELATION_TYPE_MAP: Record<string, string> = {
  blocking: 'Blocking',
  'relates-to': 'RelatesTo',
  relatesto: 'RelatesTo',
  duplicate: 'Duplicate',
  'starts-before': 'StartsBefore',
  startsbefore: 'StartsBefore',
  'finishes-before': 'FinishesBefore',
  finishesbefore: 'FinishesBefore',
};

interface RelateOptions {
  type?: string;
}

export function createRelateCommand(): Command {
  return new Command('relate')
    .description('Create a relation between two work items')
    .argument('<source>', 'Source work item identifier (e.g. PROJ-1)')
    .argument('<target>', 'Target work item identifier (e.g. PROJ-2)')
    .option(
      '-t, --type <type>',
      'Relation type (blocking, relates-to, duplicate, starts-before, finishes-before)'
    )
    .action(async (sourceId: string, targetId: string, options: RelateOptions) => {
      try {
        const getItem = container.resolve(GetWorkItemUseCase);

        const sourceResult = await getItem.execute(sourceId);
        if (!sourceResult.ok) {
          messages.error(`Source work item not found: "${sourceId}"`);
          process.exitCode = 1;
          return;
        }

        const targetResult = await getItem.execute(targetId);
        if (!targetResult.ok) {
          messages.error(`Target work item not found: "${targetId}"`);
          process.exitCode = 1;
          return;
        }

        let relationType: string;
        if (options.type) {
          const normalized = RELATION_TYPE_MAP[options.type.toLowerCase()];
          if (!normalized) {
            messages.error(
              `Invalid relation type: "${options.type}". Valid types: blocking, relates-to, duplicate, starts-before, finishes-before`
            );
            process.exitCode = 1;
            return;
          }
          relationType = normalized;
        } else {
          relationType = await select({
            message: 'Relation type:',
            choices: RELATION_TYPE_CHOICES,
          });
        }

        const useCase = container.resolve(CreateWorkItemRelationUseCase);
        const result = await useCase.execute({
          sourceWorkItemId: sourceResult.workItem.id,
          targetWorkItemId: targetResult.workItem.id,
          relationType,
        });

        if (!result.ok) {
          messages.error(result.error);
          process.exitCode = 1;
          return;
        }

        messages.newline();
        messages.success('Relation created');
        console.log(`  ${colors.muted('Source:')} ${sourceId}`);
        console.log(`  ${colors.muted('Target:')} ${targetId}`);
        console.log(`  ${colors.muted('Type:')}   ${relationType}`);
        messages.newline();
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('force closed') || error.message.includes('User force closed'))
        ) {
          messages.info('Cancelled');
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to create relation', err);
        process.exitCode = 1;
      }
    });
}
