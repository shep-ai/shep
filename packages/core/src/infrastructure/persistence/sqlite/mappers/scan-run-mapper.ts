/**
 * Mapper between ScanRun rows and the domain entity. Stages embed as JSON;
 * the orchestrator owns the entire stages array on every write so partial
 * updates are not needed.
 */

import type {
  ScanRun,
  ScanStage,
  ScanStatus,
  ScanTrigger,
} from '../../../../domain/generated/output.js';

export interface ScanRunRow {
  id: string;
  application_id: string;
  triggered_by: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  stages_json: string;
  findings_count: number;
  created_at: number;
  updated_at: number;
}

function dateOrNumberToMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

export function toDatabase(run: ScanRun): ScanRunRow {
  return {
    id: run.id,
    application_id: run.applicationId,
    triggered_by: run.triggeredBy,
    status: run.status,
    started_at: dateOrNumberToMs(run.startedAt),
    finished_at:
      run.finishedAt !== undefined && run.finishedAt !== null
        ? dateOrNumberToMs(run.finishedAt)
        : null,
    stages_json: JSON.stringify(run.stages),
    findings_count: run.findingsCount,
    created_at: dateOrNumberToMs(run.createdAt),
    updated_at: dateOrNumberToMs(run.updatedAt),
  };
}

export function fromDatabase(row: ScanRunRow): ScanRun {
  return {
    id: row.id,
    applicationId: row.application_id,
    triggeredBy: row.triggered_by as ScanTrigger,
    status: row.status as ScanStatus,
    startedAt: new Date(row.started_at),
    finishedAt: row.finished_at !== null ? new Date(row.finished_at) : undefined,
    stages: JSON.parse(row.stages_json) as ScanStage[],
    findingsCount: row.findings_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
