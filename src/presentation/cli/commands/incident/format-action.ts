/** How runtime actions read in the terminal (spec 129). */

import { RuntimeActionStatus, type RuntimeAction } from '@/domain/generated/output.js';
import { actionLabel } from '@/domain/shared/incidents.js';
import { getCliI18n } from '../../i18n.js';

export function formatAction(action: RuntimeAction): string {
  const t = getCliI18n().t;
  const label = actionLabel(action.kind, action.replicas);
  const recovery =
    action.recovered === undefined
      ? ''
      : t(
          action.recovered
            ? 'cli:commands.incident.recovered'
            : 'cli:commands.incident.notRecovered'
        );
  const output =
    action.status === RuntimeActionStatus.Failed && action.output ? ` — ${action.output}` : '';
  return `${label}: ${action.status}${recovery ? `, ${recovery}` : ''}${output}`;
}
