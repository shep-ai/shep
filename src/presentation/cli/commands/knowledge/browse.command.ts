/** shep knowledge sync | ls | search (spec 125). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { SyncKnowledgeSourceUseCase } from '@/application/use-cases/knowledge/sync-knowledge-source.use-case.js';
import type { KnowledgeSyncOutcome } from '@/application/use-cases/knowledge/sync-knowledge-source.use-case.js';
import { SyncKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/sync-knowledge-sources.use-case.js';
import { ListKnowledgeUseCase } from '@/application/use-cases/knowledge/list-knowledge.use-case.js';
import { SelectKnowledgeUseCase } from '@/application/use-cases/knowledge/select-knowledge.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand, type UseCaseResult } from '../command-result.js';
import { formatKnowledgeSummary } from './format-summary.js';

const FAILED = 'cli:commands.knowledge.failed';

/** Prints one source's run; false when it was refused or stopped early. */
function printOutcome(result: UseCaseResult<KnowledgeSyncOutcome>): boolean {
  if (!result.ok) {
    messages.error(result.error);
    return false;
  }
  const line = `${result.source.scopeTitle}: ${formatKnowledgeSummary(result.summary)}`;
  if (result.error) {
    messages.error(`${line} — ${result.error}`);
    return false;
  }
  messages.success(line);
  return true;
}

export function createSyncCommand(): Command {
  const t = getCliI18n().t;
  return new Command('sync')
    .description(t('cli:commands.knowledge.sync.description'))
    .argument('[source]', t('cli:commands.knowledge.sourceArg'))
    .action((source: string | undefined) =>
      runCommand(FAILED, async () => {
        const results = source
          ? [await container.resolve(SyncKnowledgeSourceUseCase).execute(source)]
          : await container.resolve(SyncKnowledgeSourcesUseCase).runAll();
        if (results.length === 0) {
          messages.info(t('cli:commands.knowledge.sync.nothing'));
          return;
        }
        if (!results.map(printOutcome).every(Boolean)) process.exitCode = 1;
      })
    );
}

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.knowledge.ls.description'))
    .option('-s, --space <space>', t('cli:commands.knowledge.ls.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ListKnowledgeUseCase).execute(options.space);
        report(result, ({ space, documents }) =>
          renderListView({
            title: t('cli:commands.knowledge.ls.title', { space: space.name }),
            columns: [
              { label: t('cli:commands.knowledge.ls.titleColumn'), width: 36 },
              { label: t('cli:commands.knowledge.ls.linkColumn'), width: 60 },
            ],
            rows: documents.map((document) => [document.title, colors.muted(document.url)]),
            emptyMessage: t('cli:commands.knowledge.ls.empty'),
          })
        );
      })
    );
}

export function createSearchCommand(): Command {
  const t = getCliI18n().t;
  return new Command('search')
    .description(t('cli:commands.knowledge.search.description'))
    .argument('<query>', t('cli:commands.knowledge.search.queryArg'))
    .option('-r, --repo <path>', t('cli:commands.knowledge.search.repoOption'))
    .action((query: string, options: { repo?: string }) =>
      runCommand(FAILED, async () => {
        const { passages } = await container.resolve(SelectKnowledgeUseCase).execute({
          repositoryPath: options.repo ?? process.cwd(),
          taskText: query,
        });
        if (passages.length === 0) {
          messages.info(t('cli:commands.knowledge.search.none'));
          return;
        }
        for (const passage of passages) {
          const where = passage.heading ? `${passage.title} › ${passage.heading}` : passage.title;
          messages.info(`${colors.accent(where)} ${colors.muted(passage.url)}`);
          messages.info(passage.text);
        }
      })
    );
}
