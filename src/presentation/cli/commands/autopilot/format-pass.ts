/** How `shep autopilot` prints a pass and a policy part (spec 132). */

import type { AutopilotRun } from '@/domain/generated/output.js';
import { colors, messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function onOff(value: boolean): string {
  const t = getCliI18n().t;
  return t(value ? 'cli:commands.autopilot.on' : 'cli:commands.autopilot.off');
}

/** One line per part of the pass, then each error. */
export function printPass(run: AutopilotRun): void {
  const t = getCliI18n().t;
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : colors.muted('-'));
  messages.info(
    `${run.createdAt.toISOString()}  ${t('cli:commands.autopilot.pass', {
      investigated: list(run.investigated),
      fixed: list(run.fixed),
      built: list(run.built),
    })}`
  );
  for (const error of run.errors) messages.info(`  ${colors.error(error)}`);
}
