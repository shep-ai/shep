/**
 * shep item fix <item> <number> — turn a hypothesis into a fix feature that
 * writes the failing test first (spec 123).
 */

import { Command, InvalidArgumentError } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ApproveHypothesisUseCase } from '@/application/use-cases/bug-loop/approve-hypothesis.use-case.js';
import type { AgentType } from '@/domain/generated/output.js';
import { workItemKey } from '@/domain/shared/work-item-key.js';
import { messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { refused, runCommand } from '../command-result.js';
import { parseAgentType } from '../agent-option.js';

interface FixOptions {
  spec?: boolean;
  agent?: AgentType;
}

function parseNumber(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new InvalidArgumentError(value);
  return number;
}

export function createFixCommand(): Command {
  const t = getCliI18n().t;
  return new Command('fix')
    .description(t('cli:commands.item.fix.description'))
    .argument('<item>', t('cli:commands.item.itemArg'))
    .argument('<number>', t('cli:commands.item.fix.numberArg'), parseNumber)
    .option('--spec', t('cli:commands.item.fix.specOption'))
    .option('--agent <type>', t('cli:commands.item.fix.agentOption'), parseAgentType)
    .action((item: string, number: number, options: FixOptions) =>
      runCommand('cli:commands.item.failed', async () => {
        const result = await container.resolve(ApproveHypothesisUseCase).execute({
          workItem: item,
          hypothesis: number,
          ...(options.spec ? { fullSpec: true } : {}),
          ...(options.agent ? { agentType: options.agent } : {}),
        });
        if (refused(result)) return;

        const outcome = await spinner(t('cli:commands.item.fix.spinner'), () => result.started);
        if (outcome.error) {
          messages.error(t('cli:commands.item.fix.startFailed', { error: outcome.error }));
          process.exitCode = 1;
          return;
        }
        if (outcome.warning) messages.warning(outcome.warning);
        messages.success(
          t('cli:commands.item.fix.created', {
            name: result.feature.name,
            id: result.feature.id,
            key: workItemKey(result.workItem),
            number,
          })
        );
      })
    );
}
