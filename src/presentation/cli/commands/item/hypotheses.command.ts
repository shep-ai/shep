/** shep item hypotheses <item> — the latest investigation of a work item (spec 123). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetWorkItemInvestigationsUseCase } from '@/application/use-cases/bug-loop/get-work-item-investigations.use-case.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { renderInvestigation } from './render-investigation.js';

export function createHypothesesCommand(): Command {
  const t = getCliI18n().t;
  return new Command('hypotheses')
    .description(t('cli:commands.item.hypotheses.description'))
    .argument('<item>', t('cli:commands.item.itemArg'))
    .action((item: string) =>
      runCommand('cli:commands.item.failed', async () => {
        const result = await container.resolve(GetWorkItemInvestigationsUseCase).execute(item);
        report(result, ({ workItem, investigations }) => {
          for (const line of renderInvestigation(workItem, investigations[0])) console.log(line);
        });
      })
    );
}
