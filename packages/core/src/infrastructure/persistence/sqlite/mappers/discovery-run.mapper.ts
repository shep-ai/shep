/** Row ⇄ entity conversion for discovery runs (spec 128). */

import type {
  AgentType,
  DiscoveryRun,
  DiscoveryRunStatus,
} from '../../../../domain/generated/output.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface DiscoveryRunRow {
  id: string;
  space_id: string;
  status: string;
  agent_type: string | null;
  signals_read: number;
  proposed: number;
  dropped: number;
  finished_at: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export function discoveryRunToDatabase(run: DiscoveryRun): DiscoveryRunRow {
  return {
    id: run.id,
    space_id: run.spaceId,
    status: run.status,
    agent_type: run.agentType ?? null,
    signals_read: run.signalsRead,
    proposed: run.proposed,
    dropped: run.dropped,
    finished_at: optionalMillis(run.finishedAt),
    error: run.error ?? null,
    created_at: millis(run.createdAt),
    updated_at: millis(run.updatedAt),
  };
}

export function discoveryRunFromDatabase(row: DiscoveryRunRow): DiscoveryRun {
  return {
    id: row.id,
    spaceId: row.space_id,
    status: row.status as DiscoveryRunStatus,
    signalsRead: row.signals_read,
    proposed: row.proposed,
    dropped: row.dropped,
    ...defined({
      agentType: row.agent_type as AgentType | null,
      finishedAt: optionalDate(row.finished_at),
      error: row.error,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
