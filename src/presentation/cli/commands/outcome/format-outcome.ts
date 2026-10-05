/** How `shep outcome` prints an outcome's counts and a space's calibration (spec 130). */

import type { OpportunityOutcome } from '@/domain/generated/output.js';
import type { OutcomeCalibration } from '@/domain/shared/outcomes.js';
import { getCliI18n } from '../../i18n.js';

/** "6 → 2" once judged, empty while pending. */
export function formatCounts(outcome: OpportunityOutcome): string {
  return outcome.signalsBefore === undefined || outcome.signalsAfter === undefined
    ? ''
    : `${outcome.signalsBefore} → ${outcome.signalsAfter}`;
}

export function formatCalibration(calibration: OutcomeCalibration): string {
  const t = getCliI18n().t;
  const parts = [
    calibration.hoursRatio === undefined
      ? t('cli:commands.outcome.calibration.noHours')
      : t('cli:commands.outcome.calibration.hours', {
          ratio: calibration.hoursRatio,
          timed: calibration.timed,
        }),
    calibration.judged === 0
      ? t('cli:commands.outcome.calibration.noVerdicts')
      : t('cli:commands.outcome.calibration.solved', {
          solved: calibration.solved,
          judged: calibration.judged,
        }),
  ];
  return parts.join(' · ');
}
