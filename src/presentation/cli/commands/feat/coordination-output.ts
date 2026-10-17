/**
 * `shep feat show` block for the agent's coordination decision (spec 141):
 * the same facts the web drawer's CoordinationNote shows.
 */

import { CoordinationAction, type FeatureCoordination } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';
import { colors } from '../../ui/index.js';

export function renderCoordination(
  coordination: FeatureCoordination,
  peerName: string | undefined
): { title: string; content: string } {
  const t = getCliI18n().t;
  const peer = peerName ?? coordination.peerFeatureId;
  const deferred = coordination.action === CoordinationAction.Defer;
  const headline = deferred
    ? colors.warning(t('cli:commands.feat.show.coordinationWaitsFor', { peer }))
    : colors.success(t('cli:commands.feat.show.coordinationRunsAlongside', { peer }));
  return {
    title: t('cli:commands.feat.show.coordinationTitle'),
    content: [
      headline,
      coordination.rationale,
      colors.muted(
        t('cli:commands.feat.show.coordinationSharedFiles', {
          count: coordination.overlappingPaths.length,
        })
      ),
      ...coordination.overlappingPaths.map((path) => `  ${path}`),
    ].join('\n'),
  };
}
