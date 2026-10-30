/**
 * The mission text for one improver stage (spec 150).
 */

import { HarnessImproverStage } from '../../../../domain/generated/output.js';
import type { ImproverMission } from '../../../../application/ports/output/services/harness-improver.interface.js';
import { composeMission } from './compose.prompt.js';
import { experienceMission } from './experience.prompt.js';
import { proposeMission } from './propose.prompt.js';
import { selectMission } from './select.prompt.js';

const RENDERERS: Readonly<Record<HarnessImproverStage, (m: ImproverMission) => string>> = {
  [HarnessImproverStage.Propose]: (m) => proposeMission(m.spec),
  [HarnessImproverStage.Compose]: (m) => composeMission(m.spec),
  [HarnessImproverStage.Select]: (m) => selectMission(m.spec),
  [HarnessImproverStage.Experience]: (m) => experienceMission(m.spec),
};

export function renderMission(mission: ImproverMission): string {
  const text = RENDERERS[mission.spec.stage](mission);
  if (!mission.retryFeedback) return text;
  return `${text}\n# YOUR PREVIOUS ATTEMPT WAS REJECTED\n\n${mission.retryFeedback}\n\nFix it in \`context/harness/\` and reply again.\n`;
}
