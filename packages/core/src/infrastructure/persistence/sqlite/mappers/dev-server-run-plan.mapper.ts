/**
 * DevServerRunPlan Database Mapper
 *
 * Maps between DevServerRunPlan domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as TEXT (ISO 8601 strings)
 * - plan_source stored as the RunPlanSource string value
 * - setup_commands stored as a JSON TEXT column ('[]' when empty)
 * - Optional fields (packageManager, expectedPort, language, framework,
 *   installStampHash) map null <-> undefined
 */

import type { DevServerRunPlan, RunPlanSource } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the dev_server_run_plans table schema.
 */
export interface DevServerRunPlanRow {
  repo_path: string;
  plan_source: string;
  command: string;
  cwd: string;
  package_manager: string | null;
  expected_port: number | null;
  language: string | null;
  framework: string | null;
  setup_commands: string;
  config_hash: string;
  install_stamp_hash: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Converts a domain timestamp (Date or ISO string) to the TEXT column value.
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Maps a DevServerRunPlan domain object to a database row.
 */
export function toDatabase(plan: DevServerRunPlan): DevServerRunPlanRow {
  return {
    repo_path: plan.repoPath,
    plan_source: plan.source,
    command: plan.command,
    cwd: plan.cwd,
    package_manager: plan.packageManager ?? null,
    expected_port: plan.expectedPort ?? null,
    language: plan.language ?? null,
    framework: plan.framework ?? null,
    setup_commands: JSON.stringify(plan.setupCommands),
    config_hash: plan.configHash,
    install_stamp_hash: plan.installStampHash ?? null,
    created_at: toIsoString(plan.createdAt as Date | string),
    updated_at: toIsoString(plan.updatedAt as Date | string),
  };
}

/**
 * Maps a database row to a DevServerRunPlan domain object.
 */
export function fromDatabase(row: DevServerRunPlanRow): DevServerRunPlan {
  return {
    repoPath: row.repo_path,
    source: row.plan_source as RunPlanSource,
    command: row.command,
    cwd: row.cwd,
    packageManager: row.package_manager ?? undefined,
    expectedPort: row.expected_port ?? undefined,
    language: row.language ?? undefined,
    framework: row.framework ?? undefined,
    setupCommands: JSON.parse(row.setup_commands) as string[],
    configHash: row.config_hash,
    installStampHash: row.install_stamp_hash ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
