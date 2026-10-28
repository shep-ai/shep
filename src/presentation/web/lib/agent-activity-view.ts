/**
 * Agent activity as the browser receives it (spec 148): the core shapes after
 * JSON, where dates are ISO strings, plus the URLs of the routes that serve them.
 */

import type {
  AgentActivity,
  AgentActivitySnapshot,
  WaitForAgentActivityResult,
} from '@shepai/core/application/use-cases/agent-activity/agent-activity.types';
import type { AgentActivityState } from '@shepai/core/domain/generated/output';

export type AgentActivityView = Omit<AgentActivity, 'updatedAt'> & { updatedAt: string };

export type AgentActivitySnapshotView = Omit<
  AgentActivitySnapshot,
  'generatedAt' | 'activities'
> & {
  generatedAt: string;
  activities: AgentActivityView[];
  notFound?: boolean;
};

export type ActivityWaitResultView = Omit<WaitForAgentActivityResult, 'activity'> & {
  activity?: AgentActivityView;
};

export const AGENT_ACTIVITY_PATH = '/api/agent-activity';
export const AGENT_ACTIVITY_WAIT_PATH = '/api/agent-activity/wait';

export interface AgentActivityQuery {
  featureId?: string;
  includeSettled?: boolean;
}

export function agentActivityUrl({ featureId, includeSettled }: AgentActivityQuery = {}): string {
  const params = new URLSearchParams();
  if (featureId) params.set('featureId', featureId);
  if (includeSettled) params.set('includeSettled', '1');
  const query = params.toString();
  return query ? `${AGENT_ACTIVITY_PATH}?${query}` : AGENT_ACTIVITY_PATH;
}

export function agentActivityWaitUrl(
  featureId: string,
  until?: readonly AgentActivityState[]
): string {
  const params = new URLSearchParams({ featureId });
  if (until?.length) params.set('until', until.join(','));
  return `${AGENT_ACTIVITY_WAIT_PATH}?${params.toString()}`;
}
