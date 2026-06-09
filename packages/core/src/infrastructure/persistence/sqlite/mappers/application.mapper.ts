/**
 * Application Database Mapper
 *
 * Maps between Application domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - JSON arrays stored as TEXT
 */

import type {
  Application,
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  Criticality,
  DataClassification,
  Exposure,
  ScannerProfile,
} from '../../../../domain/generated/output.js';

/**
 * Database row type matching the applications table schema.
 */
export interface ApplicationRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  repository_path: string;
  additional_paths: string;
  agent_type: string | null;
  model_override: string | null;
  status: string;
  setup_complete: number;
  agent_session_id: string | null;
  git_remote_url: string | null;
  cloud_deployment_provider: string | null;
  cloud_deployment_status: string | null;
  cloud_deployment_id: string | null;
  cloud_deployment_url: string | null;
  cloud_deployment_error: string | null;
  last_deployed_at: number | null;
  bedrock_enabled: number;
  criticality: string | null;
  exposure: string | null;
  data_classification: string | null;
  business_unit: string | null;
  scanner_profile_json: string;
  last_scanned_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function parseScannerProfile(json: string | null | undefined): ScannerProfile | undefined {
  if (!json || json === '{}') return undefined;
  try {
    const parsed = JSON.parse(json) as Partial<ScannerProfile>;
    if (
      Array.isArray(parsed.enabledStages) &&
      Array.isArray(parsed.pathExcludes) &&
      typeof parsed.autoRescan === 'boolean'
    ) {
      return parsed as ScannerProfile;
    }
  } catch {
    // Corrupt JSON — fall back to defaults so the app still loads.
  }
  return undefined;
}

function dateOrNumberToMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * Maps Application domain object to database row.
 */
export function toDatabase(app: Application): ApplicationRow {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    repository_path: app.repositoryPath,
    additional_paths: JSON.stringify(app.additionalPaths ?? []),
    agent_type: app.agentType ?? null,
    model_override: app.modelOverride ?? null,
    status: app.status,
    setup_complete: app.setupComplete ? 1 : 0,
    agent_session_id: app.agentSessionId ?? null,
    git_remote_url: app.gitRemoteUrl ?? null,
    cloud_deployment_provider: app.cloudDeploymentProvider ?? null,
    cloud_deployment_status: app.cloudDeploymentStatus ?? null,
    cloud_deployment_id: app.cloudDeploymentId ?? null,
    cloud_deployment_url: app.cloudDeploymentUrl ?? null,
    cloud_deployment_error: app.cloudDeploymentError ?? null,
    last_deployed_at:
      app.lastDeployedAt !== undefined && app.lastDeployedAt !== null
        ? dateOrNumberToMs(app.lastDeployedAt)
        : null,
    bedrock_enabled: app.bedrockEnabled ? 1 : 0,
    criticality: app.criticality ?? null,
    exposure: app.exposure ?? null,
    data_classification: app.dataClassification ?? null,
    business_unit: app.businessUnit ?? null,
    scanner_profile_json: app.scannerProfile ? JSON.stringify(app.scannerProfile) : '{}',
    last_scanned_at:
      app.lastScannedAt !== undefined && app.lastScannedAt !== null
        ? dateOrNumberToMs(app.lastScannedAt)
        : null,
    created_at: dateOrNumberToMs(app.createdAt),
    updated_at: dateOrNumberToMs(app.updatedAt),
    deleted_at: app.deletedAt ? dateOrNumberToMs(app.deletedAt) : null,
  };
}

/**
 * Maps database row to Application domain object.
 */
export function fromDatabase(row: ApplicationRow): Application {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    repositoryPath: row.repository_path,
    additionalPaths: JSON.parse(row.additional_paths) as string[],
    agentType: row.agent_type ?? undefined,
    modelOverride: row.model_override ?? undefined,
    status: row.status as Application['status'],
    setupComplete: row.setup_complete === 1,
    agentSessionId: row.agent_session_id ?? undefined,
    gitRemoteUrl: row.git_remote_url ?? undefined,
    cloudDeploymentProvider:
      (row.cloud_deployment_provider as CloudDeploymentProvider | null) ?? undefined,
    cloudDeploymentStatus:
      (row.cloud_deployment_status as CloudDeploymentStatus | null) ?? undefined,
    cloudDeploymentId: row.cloud_deployment_id ?? undefined,
    cloudDeploymentUrl: row.cloud_deployment_url ?? undefined,
    cloudDeploymentError: row.cloud_deployment_error ?? undefined,
    lastDeployedAt:
      row.last_deployed_at !== null && row.last_deployed_at !== undefined
        ? new Date(row.last_deployed_at)
        : undefined,
    bedrockEnabled: row.bedrock_enabled === 1,
    criticality: (row.criticality as Criticality | null) ?? undefined,
    exposure: (row.exposure as Exposure | null) ?? undefined,
    dataClassification: (row.data_classification as DataClassification | null) ?? undefined,
    businessUnit: row.business_unit ?? undefined,
    scannerProfile: parseScannerProfile(row.scanner_profile_json),
    lastScannedAt:
      row.last_scanned_at !== null && row.last_scanned_at !== undefined
        ? new Date(row.last_scanned_at)
        : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
