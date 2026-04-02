/**
 * Feature Database Mapper
 *
 * Maps between Feature domain objects and SQLite database rows.
 *
 * Mapping Rules:
 * - TypeScript objects (camelCase) <-> SQL columns (snake_case)
 * - Dates stored as INTEGER (unix milliseconds)
 * - Optional fields stored as NULL when missing
 * - Arrays/objects stored as JSON TEXT
 * - SdlcLifecycle stored as string value
 * - ApprovalGates flattened to allow_prd, allow_plan, allow_merge columns
 * - PullRequest flattened to pr_url, pr_number, pr_status, commit_hash, ci_status columns
 * - allowMerge also written to auto_merge for backward compatibility
 */

import type { Feature } from '../../../../domain/generated/output.js';
import type { SdlcLifecycle, PrStatus, CiStatus } from '../../../../domain/generated/output.js';
import type { FeatureMode } from '../../../../domain/generated/output.js';

/**
 * Database row type matching the features table schema.
 * Uses snake_case column names.
 */
export interface FeatureRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  user_query: string;
  repository_path: string;
  branch: string;
  lifecycle: string;
  messages: string;
  plan: string | null;
  related_artifacts: string;
  agent_run_id: string | null;
  spec_path: string | null;
  // Feature mode
  mode: string;
  // Iteration tracking
  iteration_count: number;
  max_iterations: number | null;
  // Workflow configuration (flat columns)
  push: number;
  open_pr: number;
  fork_and_pr: number;
  commit_specs: number;
  ci_watch_enabled: number;
  enable_evidence: number;
  commit_evidence: number;
  auto_merge: number;
  allow_prd: number;
  allow_plan: number;
  allow_merge: number;
  worktree_path: string | null;
  // Repository reference
  repository_id: string | null;
  // PR tracking (flat columns)
  pr_url: string | null;
  pr_number: number | null;
  pr_status: string | null;
  commit_hash: string | null;
  ci_status: string | null;
  ci_fix_attempts: number | null;
  ci_fix_history: string | null;
  pr_mergeable: number | null;
  upstream_pr_url: string | null;
  upstream_pr_number: number | null;
  upstream_pr_status: string | null;
  // Feature dependency
  parent_id: string | null;
  // Archive state
  previous_lifecycle: string | null;
  // User attachments (JSON array)
  attachments: string;
  // Skill injection
  inject_skills: number;
  injected_skills: string | null;
  // Soft delete
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * Maps Feature domain object to database row.
 * Converts Date objects to unix milliseconds and complex fields to JSON for SQL storage.
 *
 * @param feature - Feature domain object
 * @returns Database row object with snake_case columns
 */
export function toDatabase(feature: Feature): FeatureRow {
  return {
    id: feature.id,
    name: feature.name,
    slug: feature.slug,
    description: feature.description,
    user_query: feature.userQuery,
    repository_path: feature.repositoryPath,
    branch: feature.branch,
    lifecycle: feature.lifecycle,
    messages: JSON.stringify(feature.messages),
    plan: feature.plan !== undefined ? JSON.stringify(feature.plan) : null,
    related_artifacts: JSON.stringify(feature.relatedArtifacts),
    agent_run_id: feature.agentRunId ?? null,
    spec_path: feature.specPath ?? null,
    // Feature mode
    mode: feature.mode,
    // Iteration tracking
    iteration_count: feature.iterationCount,
    max_iterations: feature.maxIterations ?? null,
    // Flatten workflow flags to individual columns
    push: feature.push ? 1 : 0,
    open_pr: feature.openPr ? 1 : 0,
    fork_and_pr: feature.forkAndPr ? 1 : 0,
    commit_specs: feature.commitSpecs ? 1 : 0,
    ci_watch_enabled: feature.ciWatchEnabled ? 1 : 0,
    enable_evidence: feature.enableEvidence ? 1 : 0,
    commit_evidence: feature.commitEvidence ? 1 : 0,
    auto_merge: feature.approvalGates?.allowMerge ? 1 : 0,
    allow_prd: feature.approvalGates?.allowPrd ? 1 : 0,
    allow_plan: feature.approvalGates?.allowPlan ? 1 : 0,
    allow_merge: feature.approvalGates?.allowMerge ? 1 : 0,
    worktree_path: feature.worktreePath ?? null,
    // Repository reference
    repository_id: feature.repositoryId ?? null,
    // Flatten pr to individual columns
    pr_url: feature.pr?.url ?? null,
    pr_number: feature.pr?.number ?? null,
    pr_status: feature.pr?.status ?? null,
    commit_hash: feature.pr?.commitHash ?? null,
    ci_status: feature.pr?.ciStatus ?? null,
    ci_fix_attempts: feature.pr?.ciFixAttempts ?? null,
    ci_fix_history: feature.pr?.ciFixHistory ? JSON.stringify(feature.pr.ciFixHistory) : null,
    pr_mergeable: feature.pr?.mergeable !== undefined ? (feature.pr.mergeable ? 1 : 0) : null,
    upstream_pr_url: feature.pr?.upstreamPrUrl ?? null,
    upstream_pr_number: feature.pr?.upstreamPrNumber ?? null,
    upstream_pr_status: feature.pr?.upstreamPrStatus ?? null,
    // Feature dependency
    parent_id: feature.parentId ?? null,
    // Archive state
    previous_lifecycle: feature.previousLifecycle ?? null,
    // User attachments
    attachments: JSON.stringify(
      (feature.attachments ?? []).map((a) => ({ ...a, size: Number(a.size) }))
    ),
    // Skill injection
    inject_skills: feature.injectSkills ? 1 : 0,
    injected_skills: feature.injectedSkills?.length ? JSON.stringify(feature.injectedSkills) : null,
    // Soft delete
    deleted_at:
      feature.deletedAt instanceof Date ? feature.deletedAt.getTime() : (feature.deletedAt ?? null),
    created_at: feature.createdAt instanceof Date ? feature.createdAt.getTime() : feature.createdAt,
    updated_at: feature.updatedAt instanceof Date ? feature.updatedAt.getTime() : feature.updatedAt,
  };
}

/**
 * Maps database row to Feature domain object.
 * Converts unix milliseconds back to Date objects and JSON strings to arrays/objects.
 *
 * @param row - Database row with snake_case columns
 * @returns Feature domain object with camelCase properties
 */
export function fromDatabase(row: FeatureRow): Feature {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    userQuery: row.user_query,
    repositoryPath: row.repository_path,
    branch: row.branch,
    lifecycle: row.lifecycle as SdlcLifecycle,
    messages: JSON.parse(row.messages),
    relatedArtifacts: JSON.parse(row.related_artifacts),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    ...(row.plan != null && { plan: JSON.parse(row.plan) }),
    ...(row.agent_run_id != null && { agentRunId: row.agent_run_id }),
    ...(row.spec_path != null && { specPath: row.spec_path }),
    // Feature mode
    mode: row.mode as FeatureMode,
    // Iteration tracking
    iterationCount: row.iteration_count ?? 0,
    ...(row.max_iterations != null && { maxIterations: row.max_iterations }),
    // Assemble workflow flags from flat columns
    push: row.push === 1,
    openPr: row.open_pr === 1,
    forkAndPr: row.fork_and_pr === 1,
    commitSpecs: row.commit_specs === 1,
    ciWatchEnabled: row.ci_watch_enabled === 1,
    enableEvidence: row.enable_evidence === 1,
    commitEvidence: row.commit_evidence === 1,
    approvalGates: {
      allowPrd: row.allow_prd === 1,
      allowPlan: row.allow_plan === 1,
      allowMerge: row.allow_merge === 1,
    },
    ...(row.worktree_path != null && { worktreePath: row.worktree_path }),
    // Repository reference
    ...(row.repository_id != null && { repositoryId: row.repository_id }),
    // Assemble pr from flat columns (only when pr_url exists)
    ...(row.pr_url != null && {
      pr: {
        url: row.pr_url,
        number: row.pr_number!,
        status: row.pr_status as PrStatus,
        ...(row.commit_hash != null && { commitHash: row.commit_hash }),
        ...(row.ci_status != null && { ciStatus: row.ci_status as CiStatus }),
        ...(row.ci_fix_attempts != null && { ciFixAttempts: row.ci_fix_attempts }),
        ...(row.ci_fix_history != null && { ciFixHistory: JSON.parse(row.ci_fix_history) }),
        ...(row.pr_mergeable != null && { mergeable: row.pr_mergeable === 1 }),
        ...(row.upstream_pr_url != null && { upstreamPrUrl: row.upstream_pr_url }),
        ...(row.upstream_pr_number != null && { upstreamPrNumber: row.upstream_pr_number }),
        ...(row.upstream_pr_status != null && {
          upstreamPrStatus: row.upstream_pr_status as PrStatus,
        }),
      },
    }),
    // Feature dependency
    ...(row.parent_id != null && { parentId: row.parent_id }),
    // Archive state
    ...(row.previous_lifecycle != null && {
      previousLifecycle: row.previous_lifecycle as SdlcLifecycle,
    }),
    // User attachments
    attachments: JSON.parse(row.attachments ?? '[]'),
    // Skill injection
    injectSkills: row.inject_skills === 1,
    ...(row.injected_skills != null && { injectedSkills: JSON.parse(row.injected_skills) }),
    // Soft delete
    ...(row.deleted_at != null && { deletedAt: new Date(row.deleted_at) }),
  };
}
