/** Row ⇄ entity conversion for work item investigations (spec 123). */

import type {
  AgentType,
  Hypothesis,
  InvestigationStatus,
  WorkItemInvestigation,
} from '../../../../domain/generated/output.js';
import { normalizeRepositoryPath } from '../../../../domain/shared/repository-path.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface InvestigationRow {
  id: string;
  work_item_id: string;
  repository_path: string;
  commit_sha: string | null;
  status: string;
  summary: string | null;
  hypotheses: string;
  agent_type: string | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
  approved_hypothesis_number: number | null;
  feature_id: string | null;
  created_at: number;
  updated_at: number;
}

export function investigationToDatabase(investigation: WorkItemInvestigation): InvestigationRow {
  return {
    id: investigation.id,
    work_item_id: investigation.workItemId,
    repository_path: normalizeRepositoryPath(investigation.repositoryPath),
    commit_sha: investigation.commitSha ?? null,
    status: investigation.status,
    summary: investigation.summary ?? null,
    hypotheses: JSON.stringify(investigation.hypotheses),
    agent_type: investigation.agentType ?? null,
    error: investigation.error ?? null,
    started_at: optionalMillis(investigation.startedAt),
    finished_at: optionalMillis(investigation.finishedAt),
    approved_hypothesis_number: investigation.approvedHypothesisNumber ?? null,
    feature_id: investigation.featureId ?? null,
    created_at: millis(investigation.createdAt),
    updated_at: millis(investigation.updatedAt),
  };
}

export function investigationFromDatabase(row: InvestigationRow): WorkItemInvestigation {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    repositoryPath: row.repository_path,
    status: row.status as InvestigationStatus,
    hypotheses: JSON.parse(row.hypotheses) as Hypothesis[],
    ...defined({
      commitSha: row.commit_sha,
      summary: row.summary,
      agentType: row.agent_type as AgentType | null,
      error: row.error,
      startedAt: optionalDate(row.started_at),
      finishedAt: optionalDate(row.finished_at),
      approvedHypothesisNumber: row.approved_hypothesis_number,
      featureId: row.feature_id,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
