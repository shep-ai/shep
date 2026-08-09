/**
 * Run-plan rendering shared by `shep dev plan show`, `plan set` and
 * `dev status`.
 *
 * Purely presentational: every value printed here — including `isStale` — is
 * already derived by `GetDevServerRunPlanUseCase`, so the CLI and the web
 * disclosure cannot disagree about what "stale" means (FR-13).
 */

import type { DevServerRunPlanView } from '@/application/use-cases/deployments/dev-server-run-plan-vocabulary.js';
import { RunPlanSource } from '@/domain/generated/output.js';

import { getCliI18n } from '../../i18n.js';
import { colors } from '../../ui/index.js';

/** Translated, colour-coded label for a plan's provenance. */
export function sourceLabel(source: RunPlanSource): string {
  const t = getCliI18n().t;
  switch (source) {
    case RunPlanSource.Manual:
      return colors.accent(t('cli:commands.dev.plan.source.manual'));
    case RunPlanSource.Agent:
      return colors.info(t('cli:commands.dev.plan.source.agent'));
    default:
      return colors.muted(t('cli:commands.dev.plan.source.deterministic'));
  }
}

function field(label: string, value: string): string {
  return `  ${colors.muted(`${label.padEnd(16)}:`)} ${value}\n`;
}

/** Print a resolved run plan, plus the staleness hint when it applies. */
export function printRunPlan(plan: DevServerRunPlanView): void {
  const t = getCliI18n().t;
  const dash = colors.muted('—');

  let out = '';
  out += field(t('cli:commands.dev.plan.fields.command'), colors.accent(plan.command));
  out += field(t('cli:commands.dev.plan.fields.cwd'), plan.cwd);
  out += field(t('cli:commands.dev.plan.fields.source'), sourceLabel(plan.source));
  out += field(t('cli:commands.dev.plan.fields.language'), plan.language ?? dash);
  out += field(t('cli:commands.dev.plan.fields.framework'), plan.framework ?? dash);
  out += field(
    t('cli:commands.dev.plan.fields.expectedPort'),
    plan.expectedPort === undefined ? dash : String(plan.expectedPort)
  );
  out += field(t('cli:commands.dev.plan.fields.packageManager'), plan.packageManager ?? dash);
  out += field(
    t('cli:commands.dev.plan.fields.setupCommands'),
    plan.setupCommands.length > 0 ? plan.setupCommands.join(', ') : dash
  );
  process.stdout.write(out);

  if (plan.isStale) {
    process.stdout.write(`\n  ${colors.warning(t('cli:commands.dev.plan.staleHint'))}\n`);
  }
}
