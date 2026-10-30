/**
 * shep learn adopt | reject | rollback | reflect (spec 150) — act on
 * learned-harness versions through their use cases. Every refusal prints the
 * use case's reason and exits 1.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { HarnessRefinementStatus } from '@/domain/generated/output.js';
import { AdoptHarnessVersionUseCase } from '@/application/use-cases/harness-learning/adopt-harness-version.use-case.js';
import { ImportHarnessVersionUseCase } from '@/application/use-cases/harness-learning/import-harness-version.use-case.js';
import { RejectHarnessVersionUseCase } from '@/application/use-cases/harness-learning/reject-harness-version.use-case.js';
import { RollbackHarnessVersionUseCase } from '@/application/use-cases/harness-learning/rollback-harness-version.use-case.js';
import { ReflectOnFeatureUseCase } from '@/application/use-cases/harness-learning/reflect-on-feature.use-case.js';
import { messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { resolveCliPath } from '../../paths.js';
import { runCommand } from '../command-result.js';
import {
  CLI_ACTOR,
  FAILED,
  LEARN,
  examples,
  fail,
  labels,
  repositoryPathOf,
  shortId,
  usd,
  withRepoOption,
  type RepoOption,
} from './learn-output.js';

async function importDirectory(dir: string, options: RepoOption): Promise<void> {
  const t = getCliI18n().t;
  const directory = resolveCliPath(dir);
  const result = await container.resolve(ImportHarnessVersionUseCase).execute({
    repositoryPath: repositoryPathOf(options),
    directory,
    actor: CLI_ACTOR,
  });
  if (!result.imported || !result.versionId) {
    fail(t(`${LEARN}.adopt.importRefused`, { dir: directory }));
    for (const problem of result.problems) messages.error(problem);
    return;
  }
  const id = shortId(result.versionId);
  if (!result.adopted) return fail(t(`${LEARN}.adopt.importedNotAdopted`, { id }));
  messages.success(t(`${LEARN}.adopt.imported`, { id }));
}

export function createAdoptCommand(): Command {
  const t = getCliI18n().t;
  return withRepoOption(
    new Command('adopt')
      .description(t(`${LEARN}.adopt.description`))
      .argument('[version]', t(`${LEARN}.versionArg`))
      .option('--from-dir <dir>', t(`${LEARN}.adopt.fromDirOption`))
  )
    .addHelpText(
      'after',
      examples('shep learn adopt 3f2a9c1e', 'shep learn adopt --from-dir ./my-harness')
    )
    .action((versionId: string | undefined, options: RepoOption & { fromDir?: string }) =>
      runCommand(FAILED, async () => {
        if (Boolean(versionId) === Boolean(options.fromDir)) {
          return fail(t(`${LEARN}.adopt.needsOne`));
        }
        if (options.fromDir) return importDirectory(options.fromDir, options);
        const id = versionId!;
        const result = await container
          .resolve(AdoptHarnessVersionUseCase)
          .execute({ versionId: id, actor: CLI_ACTOR });
        if (!result.adopted) {
          return fail(t(`${LEARN}.adopt.refused`, { id, reason: result.reason ?? '' }));
        }
        messages.success(t(`${LEARN}.adopt.adopted`, { id }));
        if (result.reason) messages.info(result.reason);
        if (result.memoryFactsRecorded > 0) {
          messages.info(t(`${LEARN}.adopt.memoryFacts`, { count: result.memoryFactsRecorded }));
        }
      })
    );
}

export function createRejectCommand(): Command {
  const t = getCliI18n().t;
  return new Command('reject')
    .description(t(`${LEARN}.reject.description`))
    .argument('<version>', t(`${LEARN}.versionArg`))
    .option('--feedback <text>', t(`${LEARN}.reject.feedbackOption`))
    .addHelpText(
      'after',
      examples('shep learn reject 3f2a9c1e --feedback "The skill duplicates CONTRIBUTING.md"')
    )
    .action((versionId: string, options: { feedback?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(RejectHarnessVersionUseCase).execute({
          versionId,
          ...(options.feedback && { feedback: options.feedback }),
          actor: CLI_ACTOR,
        });
        if (!result.rejected) {
          return fail(t(`${LEARN}.reject.refused`, { id: versionId, reason: result.reason ?? '' }));
        }
        messages.success(t(`${LEARN}.reject.rejected`, { id: versionId }));
      })
    );
}

export function createRollbackCommand(): Command {
  const t = getCliI18n().t;
  return withRepoOption(
    new Command('rollback')
      .description(t(`${LEARN}.rollback.description`))
      .option('--reason <text>', t(`${LEARN}.rollback.reasonOption`))
  )
    .addHelpText(
      'after',
      examples('shep learn rollback', 'shep learn rollback --reason "More CI fixes since adoption"')
    )
    .action((options: RepoOption & { reason?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(RollbackHarnessVersionUseCase).execute({
          repositoryPath: repositoryPathOf(options),
          ...(options.reason && { reason: options.reason }),
        });
        if (!result.rolledBack) {
          return fail(t(`${LEARN}.rollback.refused`, { reason: result.reason ?? '' }));
        }
        messages.success(t(`${LEARN}.rollback.rolledBack`));
        messages.info(
          result.restoredVersionId
            ? t(`${LEARN}.rollback.restored`, { id: shortId(result.restoredVersionId) })
            : t(`${LEARN}.rollback.toBase`)
        );
      })
    );
}

export function createReflectCommand(): Command {
  const t = getCliI18n().t;
  return new Command('reflect')
    .description(t(`${LEARN}.reflect.description`))
    .argument('<feature>', t(`${LEARN}.reflect.featureArg`))
    .addHelpText('after', examples('shep learn reflect 9c41e2b7'))
    .action((featureId: string) =>
      runCommand(FAILED, async () => {
        const result = await spinner(t(`${LEARN}.reflect.spinner`), () =>
          container.resolve(ReflectOnFeatureUseCase).execute({ featureId })
        );
        if (result.skipped) {
          return fail(t(`${LEARN}.reflect.skipped`, { reason: result.reason ?? '' }));
        }
        // A reflection that ran always reports its status; treat a missing one as a failure.
        const status = result.status ?? HarnessRefinementStatus.Failed;
        const finished = t(`${LEARN}.reflect.finished`, {
          status: labels.refinement(status),
          cost: usd(result.costUsd),
        });
        if (status === HarnessRefinementStatus.Failed) {
          return fail(result.reason ? `${finished} — ${result.reason}` : finished);
        }
        messages.success(finished);
        if (!result.candidateVersionId) return;
        const id = shortId(result.candidateVersionId);
        messages.info(
          result.autoAdopted
            ? t(`${LEARN}.reflect.autoAdopted`, { id })
            : t(`${LEARN}.reflect.candidate`, { id })
        );
      })
    );
}
