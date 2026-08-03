/**
 * Repo Import Command
 *
 * Bulk-import the subfolders of a parent directory as tracked repositories.
 * Fills the gap where `repo add` only clones from GitHub and the path-based
 * flow had no CLI surface at all.
 *
 * Usage:
 *   shep repo import ~/Code            # interactive multi-select
 *   shep repo import ~/Code --all      # import every candidate, no prompt
 *   shep repo import ~/Code --all --git-only
 *
 * Presentation stays thin: candidate annotation and import orchestration live
 * in DiscoverImportCandidatesUseCase / ImportLocalRepositoriesUseCase.
 */

import { Command } from 'commander';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { DiscoverImportCandidatesUseCase } from '@/application/use-cases/repositories/discover-import-candidates.use-case.js';
import { ImportLocalRepositoriesUseCase } from '@/application/use-cases/repositories/import-local-repositories.use-case.js';
import type { ImportCandidate } from '@/application/use-cases/repositories/discover-import-candidates.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

interface ImportOptions {
  all?: boolean;
  gitOnly?: boolean;
}

/**
 * Expand a leading `~` to the user's home directory.
 *
 * Shells expand this before argv, but `shep repo import "~/Code"` (quoted) and
 * non-shell invocations do not, so the command handles it explicitly.
 */
function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return join(homedir(), input.slice(2));
  return input;
}

/** Human-readable status label for a candidate. */
function statusLabel(candidate: ImportCandidate, t: (key: string) => string): string {
  if (candidate.alreadyTracked) return t('cli:commands.repo.import.statusTracked');
  if (candidate.previouslyRemoved) return t('cli:commands.repo.import.statusRestorable');
  return t('cli:commands.repo.import.statusNew');
}

export function createImportCommand(): Command {
  const t = getCliI18n().t;
  return new Command('import')
    .description(t('cli:commands.repo.import.description'))
    .argument('<dir>', t('cli:commands.repo.import.dirArgument'))
    .option('--all', t('cli:commands.repo.import.allOption'))
    .option('--git-only', t('cli:commands.repo.import.gitOnlyOption'))
    .action(async (dir: string, options: ImportOptions) => {
      try {
        const discover = container.resolve(DiscoverImportCandidatesUseCase);
        const importRepos = container.resolve(ImportLocalRepositoriesUseCase);

        const directoryPath = resolvePath(expandHome(dir));
        const { candidates } = await discover.execute({ directoryPath });

        if (candidates.length === 0) {
          messages.info(t('cli:commands.repo.import.noCandidates', { path: directoryPath }));
          return;
        }

        renderListView({
          title: t('cli:commands.repo.import.title'),
          columns: [
            { label: t('cli:commands.repo.import.nameColumn'), width: 28 },
            { label: t('cli:commands.repo.import.gitColumn'), width: 6 },
            { label: t('cli:commands.repo.import.statusColumn'), width: 20 },
            { label: t('cli:commands.repo.import.pathColumn'), width: 40 },
          ],
          rows: candidates.map((c) => [
            c.name,
            c.isGitRepository ? 'yes' : colors.muted('no'),
            statusLabel(c, t),
            colors.muted(c.path),
          ]),
          emptyMessage: t('cli:commands.repo.import.noCandidates', { path: directoryPath }),
        });

        const selectable = candidates.filter(
          (c) => !c.alreadyTracked && (!options.gitOnly || c.isGitRepository)
        );

        const selectedPaths = options.all
          ? selectable.map((c) => c.path)
          : await promptForSelection(selectable, t);

        if (selectedPaths.length === 0) {
          messages.info(t('cli:commands.repo.import.nothingSelected'));
          return;
        }

        const result = await importRepos.execute({ paths: selectedPaths });

        for (const entry of result.results) {
          if (entry.imported) {
            messages.success(
              t('cli:commands.repo.import.importedOne', {
                name: entry.repository?.name ?? entry.path,
              })
            );
          } else {
            messages.error(
              t('cli:commands.repo.import.failedEntry', {
                path: entry.path,
                error: entry.error ?? 'unknown error',
              })
            );
          }
        }

        messages.info(
          t('cli:commands.repo.import.summary', {
            imported: result.importedCount,
            failed: result.failedCount,
          })
        );

        // Non-zero exit when any path failed so scripted runs can detect it.
        if (result.failedCount > 0) process.exitCode = 1;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.repo.import.failedToImport'), err);
        process.exitCode = 1;
      }
    });
}

async function promptForSelection(
  selectable: ImportCandidate[],
  t: (key: string) => string
): Promise<string[]> {
  if (selectable.length === 0) return [];

  return checkbox({
    message: t('cli:commands.repo.import.selectPrompt'),
    choices: selectable.map((c) => ({
      name: c.isGitRepository ? c.name : `${c.name} (no git)`,
      value: c.path,
      checked: c.isGitRepository,
    })),
  });
}
