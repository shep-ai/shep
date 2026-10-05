/** Row ⇄ entity conversion for autopilot policies and passes (spec 132). */

import type { AutopilotPolicy, AutopilotRun } from '../../../../domain/generated/output.js';
import { defined, millis } from './row-values.js';

export interface AutopilotPolicyRow {
  space_id: string;
  investigate_urgent: number;
  fix_confident: number;
  merge_fixes: number;
  fill_line: number;
  project_id: string | null;
  daily_fix_budget: number;
  updated_at: number;
}

export interface AutopilotRunRow {
  id: string;
  space_id: string;
  investigated: string;
  fixed: string;
  built: string;
  errors: string;
  created_at: number;
  updated_at: number;
}

const flag = (value: boolean): number => (value ? 1 : 0);

export function policyToDatabase(policy: AutopilotPolicy): AutopilotPolicyRow {
  return {
    space_id: policy.spaceId,
    investigate_urgent: flag(policy.investigateUrgent),
    fix_confident: flag(policy.fixConfident),
    merge_fixes: flag(policy.mergeFixes),
    fill_line: flag(policy.fillLine),
    project_id: policy.projectId ?? null,
    daily_fix_budget: policy.dailyFixBudget,
    updated_at: millis(policy.updatedAt),
  };
}

export function policyFromDatabase(row: AutopilotPolicyRow): AutopilotPolicy {
  return {
    spaceId: row.space_id,
    investigateUrgent: row.investigate_urgent === 1,
    fixConfident: row.fix_confident === 1,
    mergeFixes: row.merge_fixes === 1,
    fillLine: row.fill_line === 1,
    ...defined({ projectId: row.project_id }),
    dailyFixBudget: row.daily_fix_budget,
    updatedAt: new Date(row.updated_at),
  };
}

export function runToDatabase(run: AutopilotRun): AutopilotRunRow {
  return {
    id: run.id,
    space_id: run.spaceId,
    investigated: JSON.stringify(run.investigated),
    fixed: JSON.stringify(run.fixed),
    built: JSON.stringify(run.built),
    errors: JSON.stringify(run.errors),
    created_at: millis(run.createdAt),
    updated_at: millis(run.updatedAt),
  };
}

export function runFromDatabase(row: AutopilotRunRow): AutopilotRun {
  return {
    id: row.id,
    spaceId: row.space_id,
    investigated: JSON.parse(row.investigated) as string[],
    fixed: JSON.parse(row.fixed) as string[],
    built: JSON.parse(row.built) as string[],
    errors: JSON.parse(row.errors) as string[],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
