/**
 * shep item investigate <item> — an agent reads the repository in a
 * throwaway checkout and ranks root-cause hypotheses (spec 123).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { InvestigateWorkItemUseCase } from '@/application/use-cases/bug-loop/investigate-work-item.use-case.js';
import type { AgentType } from '@/domain/generated/output.js';
import { workItemKey } from '@/domain/shared/work-item-key.js';
import { messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { resolveCliPath } from '../../paths.js';
import { refused, runCommand } from '../command-result.js';
import { parseAgentType } from '../agent-option.js';
import { renderInvestigation } from './render-investigation.js';

interface InvestigateOptions {
  repo?: string;
  agent?: AgentType;
}

export function createInvestigateCommand(): Command {
  const t = getCliI18n().t;
  return new Command('investigate')
    .description(t('cli:commands.item.investigate.description'))
    .argument('<item>', t('cli:commands.item.itemArg'))
    .option('--repo <path>', t('cli:commands.item.investigate.repoOption'))
    .option('--agent <type>', t('cli:commands.item.agentOption'), parseAgentType)
    .addHelpText(
      'after',
      `
Examples:
  $ shep item investigate PAY-42 --repo ~/src/pay
  $ shep item investigate PAY-42 --agent codex-cli`
    )
    .action((item: string, options: InvestigateOptions) =>
      runCommand('cli:commands.item.failed', async () => {
        const useCase = container.resolve(InvestigateWorkItemUseCase);
        const started = await useCase.start({
          workItem: item,
          ...(options.repo ? { repositoryPath: resolveCliPath(options.repo) } : {}),
          ...(options.agent ? { agentType: options.agent } : {}),
        });
        if (refused(started)) return;

        const { workItem, investigation } = started;
        const key = workItemKey(workItem);
        messages.info(
          t('cli:commands.item.investigate.starting', {
            key,
            repository: investigation.repositoryPath,
            agent: investigation.agentType,
          })
        );
        const finished = await spinner(
          t('cli:commands.item.investigate.spinner', {
            key,
            repository: investigation.repositoryPath,
          }),
          () => useCase.run(investigation.id)
        );
        for (const line of renderInvestigation(workItem, finished)) console.log(line);
        if (finished.error) process.exitCode = 1;
      })
    );
}
