/** shep incident triage | act | approve | reject (spec 129). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { TriageIncidentUseCase } from '@/application/use-cases/incidents/triage-incident.use-case.js';
import { RuntimeActionsUseCase } from '@/application/use-cases/incidents/runtime-actions.use-case.js';
import {
  ActionProposer,
  RuntimeActionKind,
  RuntimeActionStatus,
  type AgentType,
  type RuntimeAction,
} from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseAgentType } from '../agent-option.js';
import { parseNumberOption } from '../number-option.js';
import { readRuntimeActionKind } from './action-option.js';
import { formatAction } from './format-action.js';
import { FAILED } from './manage.command.js';

function printAction(action: RuntimeAction): void {
  const t = getCliI18n().t;
  if (action.status === RuntimeActionStatus.Proposed) {
    messages.info(
      t('cli:commands.incident.awaiting', { action: formatAction(action), id: action.id })
    );
    return;
  }
  const print = action.status === RuntimeActionStatus.Failed ? messages.error : messages.success;
  print(formatAction(action));
}

export function createTriageCommand(): Command {
  const t = getCliI18n().t;
  return new Command('triage')
    .description(t('cli:commands.incident.triage.description'))
    .argument('<incident>', t('cli:commands.incident.incidentArg'))
    .option('--agent <type>', t('cli:commands.incident.triage.agentOption'), parseAgentType)
    .action((id: string, options: { agent?: AgentType }) =>
      runCommand(FAILED, async () => {
        messages.info(t('cli:commands.incident.triage.started'));
        const result = await container.resolve(TriageIncidentUseCase).execute(id, options.agent);
        report(result, ({ summary, hypotheses, action }) => {
          if (summary) messages.info(summary);
          for (const [index, hypothesis] of hypotheses.entries()) {
            messages.info(`  ${index + 1}. ${hypothesis.cause} (${hypothesis.confidence})`);
          }
          if (action) printAction(action);
        });
      })
    );
}

interface ActOptions {
  replicas?: string;
  reason?: string;
}

export function createActCommand(): Command {
  const t = getCliI18n().t;
  return new Command('act')
    .description(t('cli:commands.incident.act.description'))
    .argument('<incident>', t('cli:commands.incident.incidentArg'))
    .argument('<action>', t('cli:commands.incident.act.actionArg'))
    .option('-r, --replicas <count>', t('cli:commands.incident.act.replicasOption'))
    .option('--reason <text>', t('cli:commands.incident.act.reasonOption'))
    .action((id: string, action: string, options: ActOptions) =>
      runCommand(FAILED, async () => {
        const read = readRuntimeActionKind(action);
        const replicas = read.ok ? parseNumberOption('--replicas', options.replicas) : read;
        if (!read.ok || !read.value || !replicas.ok) return;
        const kind = read.value;
        const result = await container.resolve(RuntimeActionsUseCase).propose(
          id,
          {
            kind,
            ...(kind === RuntimeActionKind.Scale && replicas.value !== undefined
              ? { replicas: replicas.value }
              : {}),
            reason: options.reason ?? '',
          },
          ActionProposer.Person
        );
        report(result, ({ action }) => printAction(action));
      })
    );
}

export function createDecisionCommands(): Command[] {
  const t = getCliI18n().t;
  const approve = new Command('approve')
    .description(t('cli:commands.incident.approve.description'))
    .argument('<action>', t('cli:commands.incident.actionIdArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(RuntimeActionsUseCase).approve(id);
        report(result, ({ action }) => printAction(action));
      })
    );
  const reject = new Command('reject')
    .description(t('cli:commands.incident.reject.description'))
    .argument('<action>', t('cli:commands.incident.actionIdArg'))
    .option('--reason <text>', t('cli:commands.incident.reject.reasonOption'))
    .action((id: string, options: { reason?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(RuntimeActionsUseCase).reject(id, options.reason);
        report(result, () => messages.success(t('cli:commands.incident.reject.success', { id })));
      })
    );
  return [approve, reject];
}
