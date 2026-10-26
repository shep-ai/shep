/**
 * Shared output for `shep feat status` and `shep feat wait` (spec 148): a
 * feature's agent activity in words, and the command that acts on it.
 */

import type { TFunction } from 'i18next';
import { AgentActivityState, FeatureStateReason } from '@/domain/generated/output.js';
import type { AgentActivity } from '@/application/use-cases/agent-activity/agent-activity.types.js';
import { colors, messages, renderDetailView } from '../../ui/index.js';

const STATE_COLOR: Record<AgentActivityState, (text: string) => string> = {
  [AgentActivityState.Working]: colors.info,
  [AgentActivityState.Blocked]: colors.warning,
  [AgentActivityState.Waiting]: colors.muted,
  [AgentActivityState.Done]: colors.success,
  [AgentActivityState.Failed]: colors.error,
};

const STATUS = 'cli:commands.feat.status';

/** Exactly one feature for an id or prefix, or an error printed and exit code 1. */
export function singleActivity(
  activities: AgentActivity[],
  featureId: string,
  t: TFunction
): AgentActivity | undefined {
  if (activities.length === 1) return activities[0];
  messages.error(
    activities.length === 0
      ? t(`${STATUS}.notFound`, { id: featureId })
      : t(`${STATUS}.ambiguous`, { id: featureId, count: activities.length })
  );
  process.exitCode = 1;
  return undefined;
}

export function stateLabel(state: AgentActivityState, t: TFunction): string {
  return STATE_COLOR[state](t(`${STATUS}.states.${state}`));
}

export function renderActivity(activity: AgentActivity, t: TFunction): void {
  const label = (key: string) => t(`${STATUS}.labels.${key}`);
  renderDetailView({
    title: `${activity.name}  ${stateLabel(activity.state, t)}`,
    sections: [
      {
        fields: [
          { label: label('why'), value: t(`${STATUS}.reasons.${activity.reason}`) },
          { label: label('asks'), value: activity.pendingQuestion?.prompt },
          { label: label('phase'), value: activity.phase },
          { label: label('run'), value: activity.runStatus },
          {
            label: label('error'),
            value: activity.error ? colors.error(activity.error) : undefined,
          },
          { label: label('pr'), value: activity.pr?.url },
          { label: label('id'), value: activity.featureId },
          { label: label('next'), value: nextStep(activity) },
        ],
      },
    ],
  });
}

/** The command that moves a waiting feature along, when there is one. */
function nextStep(activity: AgentActivity): string | undefined {
  const question = activity.pendingQuestion;
  if (activity.reason === FeatureStateReason.AgentQuestion && question?.appId) {
    return `shep agent questions answer ${question.id} --app ${question.appId} --answer "…"`;
  }
  if (activity.reason === FeatureStateReason.ApprovalGate) {
    return `shep feat approve ${activity.shortId}  |  shep feat reject ${activity.shortId}`;
  }
  if (activity.state === AgentActivityState.Failed) return `shep feat resume ${activity.shortId}`;
  return undefined;
}
