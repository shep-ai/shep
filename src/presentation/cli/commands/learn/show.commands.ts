/**
 * shep learn show <version> | diff <a> <b> (spec 150) — one learned-harness
 * version with its components, edit verdicts and diff.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetHarnessVersionUseCase } from '@/application/use-cases/harness-learning/get-harness-version.use-case.js';
import type { HarnessVersionDetail } from '@/application/use-cases/harness-learning/get-harness-version.use-case.js';
import { fmt, messages, renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { runCommand } from '../command-result.js';
import {
  FAILED,
  LEARN,
  examples,
  fail,
  labels,
  printJson,
  shortId,
  type JsonOption,
} from './learn-output.js';
import { versionFields } from './version-view.js';

function renderVersion({ version, base, diffText, edits }: HarnessVersionDetail): void {
  const t = getCliI18n().t;
  renderDetailView({
    title: t(`${LEARN}.show.title`, { id: shortId(version.id) }),
    sections: [
      { fields: versionFields(version) },
      {
        title: t(`${LEARN}.show.componentsTitle`),
        fields: version.components.map((c) => ({ label: labels.kind(c.kind), value: c.path })),
      },
      {
        title: t(`${LEARN}.show.editsTitle`),
        fields: edits.map((edit) => ({
          label: labels.verdict(edit.verdict),
          value: `${edit.componentPath}: ${edit.change} — ${edit.observed}`,
        })),
      },
    ],
    textBlocks: [
      {
        title: base
          ? t(`${LEARN}.show.diffTitle`, { id: shortId(base.id) })
          : t(`${LEARN}.show.diffTitleBase`),
        content: diffText || t(`${LEARN}.show.noChanges`),
      },
    ],
  });
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t(`${LEARN}.show.description`))
    .argument('<version>', t(`${LEARN}.versionArg`))
    .option('--json', t(`${LEARN}.jsonOption`))
    .addHelpText('after', examples('shep learn show 3f2a9c1e', 'shep learn show 3f2a --json'))
    .action((versionId: string, options: JsonOption) =>
      runCommand(FAILED, async () => {
        const detail = await container.resolve(GetHarnessVersionUseCase).execute({ versionId });
        if (!detail) return fail(t(`${LEARN}.notFound`, { id: versionId }));
        if (options.json) return printJson(detail);
        renderVersion(detail);
      })
    );
}

export function createDiffCommand(): Command {
  const t = getCliI18n().t;
  return new Command('diff')
    .description(t(`${LEARN}.diff.description`))
    .argument('<from>', t(`${LEARN}.diff.fromArg`))
    .argument('<to>', t(`${LEARN}.diff.toArg`))
    .option('--json', t(`${LEARN}.jsonOption`))
    .addHelpText('after', examples('shep learn diff 3f2a9c1e 8b7d0e44'))
    .action((from: string, to: string, options: JsonOption) =>
      runCommand(FAILED, async () => {
        const detail = await container
          .resolve(GetHarnessVersionUseCase)
          .execute({ versionId: to, againstVersionId: from });
        if (!detail) return fail(t(`${LEARN}.notFound`, { id: `${from} / ${to}` }));
        if (options.json) return printJson(detail);
        const title = t(`${LEARN}.diff.title`, {
          from: shortId(detail.base?.id ?? from),
          to: shortId(detail.version.id),
        });
        messages.log(fmt.heading(title));
        if (detail.diffText) messages.log(detail.diffText);
        else messages.info(t(`${LEARN}.show.noChanges`));
      })
    );
}
