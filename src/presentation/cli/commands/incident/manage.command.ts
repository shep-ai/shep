/** shep incident open | ls | show | note | resolve (spec 129). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { OpenIncidentUseCase } from '@/application/use-cases/incidents/open-incident.use-case.js';
import { ManageIncidentsUseCase } from '@/application/use-cases/incidents/manage-incidents.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { formatAction } from './format-action.js';
import { readSeverity } from './action-option.js';

export const FAILED = 'cli:commands.incident.failed';

/** Continuation lines of a multi-line timeline entry line up under its text. */
const TIMELINE_INDENT = ' '.repeat(6);

interface OpenOptions {
  space?: string;
  severity?: string;
  detail?: string;
  url?: string;
  workload?: string;
  namespace?: string;
  context?: string;
}

export function createOpenCommand(): Command {
  const t = getCliI18n().t;
  return new Command('open')
    .description(t('cli:commands.incident.open.description'))
    .argument('<title>', t('cli:commands.incident.open.titleArg'))
    .option('-s, --space <space>', t('cli:commands.incident.spaceOption'))
    .option('--severity <level>', t('cli:commands.incident.open.severityOption'))
    .option('-d, --detail <text>', t('cli:commands.incident.open.detailOption'))
    .option('--url <url>', t('cli:commands.incident.open.urlOption'))
    .option('-w, --workload <deployment>', t('cli:commands.incident.open.workloadOption'))
    .option('-n, --namespace <namespace>', t('cli:commands.incident.open.namespaceOption'))
    .option('--context <context>', t('cli:commands.incident.open.contextOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep incident open "Checkout 5xx" --space acme --severity critical --workload checkout --namespace shop
  $ shep incident open "Slow search" --severity minor`
    )
    .action((title: string, options: OpenOptions) =>
      runCommand(FAILED, async () => {
        const severity = readSeverity(options.severity);
        if (!severity.ok) return;
        const result = await container.resolve(OpenIncidentUseCase).execute({
          title,
          ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
          ...(severity.value ? { severity: severity.value } : {}),
        });
        report(result, ({ incident }) =>
          messages.success(
            t('cli:commands.incident.open.success', { id: incident.id, title: incident.title })
          )
        );
      })
    );
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.incident.ls.description'))
    .option('--open', t('cli:commands.incident.ls.openOption'))
    .action((options: { open?: boolean }) =>
      runCommand(FAILED, async () => {
        const incidents = await container
          .resolve(ManageIncidentsUseCase)
          .list(options.open ? { open: true } : {});
        renderListView({
          title: t('cli:commands.incident.ls.title'),
          columns: [
            { label: t('cli:commands.incident.ls.idColumn'), width: 38 },
            { label: t('cli:commands.incident.ls.titleColumn'), width: 34 },
            { label: t('cli:commands.incident.ls.severityColumn'), width: 10 },
            { label: t('cli:commands.incident.ls.statusColumn'), width: 10 },
            { label: t('cli:commands.incident.ls.workloadColumn'), width: 24 },
          ],
          rows: incidents.map((incident) => [
            colors.muted(incident.id),
            incident.title,
            incident.severity,
            incident.status,
            incident.runtimeWorkload
              ? `${incident.runtimeNamespace}/${incident.runtimeWorkload}`
              : colors.muted('-'),
          ]),
          emptyMessage: t('cli:commands.incident.ls.empty'),
        });
      })
    );
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.incident.show.description'))
    .argument('<incident>', t('cli:commands.incident.incidentArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageIncidentsUseCase).get(id);
        report(result, ({ detail }) => {
          const { incident, events, actions } = detail;
          messages.info(
            `${colors.accent(incident.title)} ${colors.muted(`${incident.severity} · ${incident.status}`)}`
          );
          for (const event of events) {
            messages.info(
              `  ${colors.muted(event.createdAt.toISOString())} ${event.kind}: ${event.text
                .split('\n')
                .join(`\n${TIMELINE_INDENT}`)}`
            );
          }
          for (const action of actions) {
            messages.info(`  ${colors.muted(action.id)} ${formatAction(action)}`);
          }
          if (incident.postmortem) messages.info(incident.postmortem);
        });
      })
    );
}

export function createNoteCommand(): Command {
  const t = getCliI18n().t;
  return new Command('note')
    .description(t('cli:commands.incident.note.description'))
    .argument('<incident>', t('cli:commands.incident.incidentArg'))
    .argument('<text>', t('cli:commands.incident.note.textArg'))
    .action((id: string, text: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageIncidentsUseCase).note(id, text);
        report(result, () => messages.success(t('cli:commands.incident.note.success')));
      })
    );
}

export function createResolveCommand(): Command {
  const t = getCliI18n().t;
  return new Command('resolve')
    .description(t('cli:commands.incident.resolve.description'))
    .argument('<incident>', t('cli:commands.incident.incidentArg'))
    .option('--postmortem <markdown>', t('cli:commands.incident.resolve.postmortemOption'))
    .action((id: string, options: { postmortem?: string }) =>
      runCommand(FAILED, async () => {
        const useCase = container.resolve(ManageIncidentsUseCase);
        const result = options.postmortem
          ? await useCase.resolve(id, options.postmortem)
          : await useCase.resolve(id);
        report(result, ({ incident }) => {
          messages.success(t('cli:commands.incident.resolve.success', { title: incident.title }));
          if (incident.postmortem) messages.info(incident.postmortem);
        });
      })
    );
}
