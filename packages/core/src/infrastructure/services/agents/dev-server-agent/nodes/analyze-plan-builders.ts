/**
 * Pure `DevServerRunPlan` constructors for the analyze node's three
 * producing tiers.
 *
 * They live beside the node rather than inside it so the node reads as the
 * tier chain it is, and so each mapping — which is where a dropped field
 * silently costs a user their port or their setup commands — can be tested
 * on its own.
 *
 * Every builder is a pure function: no I/O, no clock beyond the `now` it is
 * handed, no persistence. The caller upserts.
 */

import { resolve } from 'node:path';
import { RunPlanSource, type DevServerRunPlan } from '@/domain/generated/output.js';
import type { DetectorSuccess } from '@/infrastructure/services/deployment/detectors/types.js';
import type { RepoDevConfig } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import type { DevServerAnalysis } from '../schemas/run-plan-analysis.schema.js';

/** Schema value the agent uses for "run in the repo root". */
export const REPO_ROOT_CWD = '.';

/**
 * Package-manager extraction heuristic for Agent plans: the plan's
 * `packageManager` is only set when one of the analysis setupCommands is an
 * obvious Node package-manager install invocation — a command starting with
 * `npm|pnpm|yarn|bun` followed by `install` or `ci`. Anything else (pip,
 * bundle, cargo, bare `yarn`, …) leaves the field unset, because
 * `packageManager` drives the install/staleness pipeline which only knows
 * how to operate Node package managers.
 */
const PACKAGE_MANAGER_INSTALL_PATTERN = /^\s*(npm|pnpm|yarn|bun)\s+(install|ci)\b/;

/**
 * Build the Deterministic plan for a winning detector result.
 *
 * The detector's richer fields (`language`, `framework`, `expectedPort`,
 * `setupCommands`) are carried onto the plan so a Deterministic plan is as
 * capable as an Agent one (FR-5, FR-6) — `expectedPort` feeds the verify
 * node's TCP fallback and `setupCommands` feed install_deps, both of which
 * were previously reachable only via an agent call.
 *
 * `runtime` is deliberately NOT persisted: there is no such field on the
 * plan, and ensure_infra derives what it probes from the command itself, so
 * storing it would create a second source of truth that could disagree with
 * what is actually spawned. It is surfaced in the tier-decision log instead.
 */
export function buildDeterministicPlan(
  detection: DetectorSuccess,
  targetPath: string,
  configHash: string,
  now: Date
): DevServerRunPlan {
  return {
    repoPath: targetPath,
    source: RunPlanSource.Deterministic,
    command: detection.command,
    cwd: detection.resolvedDir,
    ...(detection.packageManager !== undefined && { packageManager: detection.packageManager }),
    ...(detection.expectedPort !== undefined && { expectedPort: detection.expectedPort }),
    ...(detection.language !== undefined && { language: detection.language }),
    ...(detection.framework !== undefined && { framework: detection.framework }),
    setupCommands: detection.setupCommands ?? [],
    configHash,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build the Manual plan projected from a committed `.shep/dev.json`.
 *
 * The file is re-read on every start, so the row is a PROJECTION of it, not
 * a cache: nothing here may go stale. The one thing that must survive is the
 * previous row's `installStampHash` — install_deps stamps freshness with an
 * `UPDATE … WHERE repo_path = ?`, so dropping the stamp would silently
 * re-run the plan's setup commands on every single start.
 */
export function buildRepoConfigPlan(
  config: RepoDevConfig,
  targetPath: string,
  configHash: string,
  existing: DevServerRunPlan | null,
  now: Date
): DevServerRunPlan {
  return {
    repoPath: targetPath,
    source: RunPlanSource.Manual,
    command: config.command,
    cwd: config.cwd,
    ...(config.packageManager !== undefined && { packageManager: config.packageManager }),
    ...(config.expectedPort !== undefined && { expectedPort: config.expectedPort }),
    ...(config.language !== undefined && { language: config.language }),
    ...(config.framework !== undefined && { framework: config.framework }),
    setupCommands: config.setupCommands,
    configHash,
    ...(existing?.installStampHash !== undefined && {
      installStampHash: existing.installStampHash,
    }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Build an Agent-sourced run plan from a deployable analysis result. */
export function buildAgentPlan(
  analysis: DevServerAnalysis,
  command: string,
  targetPath: string,
  configHash: string,
  now: Date
): DevServerRunPlan {
  const cwd = analysis.cwd === REPO_ROOT_CWD ? targetPath : resolve(targetPath, analysis.cwd);
  const packageManager = extractPackageManager(analysis.setupCommands);

  return {
    repoPath: targetPath,
    source: RunPlanSource.Agent,
    command,
    cwd,
    ...(packageManager !== undefined && { packageManager }),
    ...(analysis.expectedPort !== null && { expectedPort: analysis.expectedPort }),
    ...(analysis.language !== null && { language: analysis.language }),
    ...(analysis.framework !== null && { framework: analysis.framework }),
    setupCommands: analysis.setupCommands,
    configHash,
    createdAt: now,
    updatedAt: now,
  };
}

/** Extract a Node package manager from setup commands (see heuristic above). */
function extractPackageManager(setupCommands: string[]): string | undefined {
  for (const command of setupCommands) {
    const match = PACKAGE_MANAGER_INSTALL_PATTERN.exec(command);
    if (match) return match[1];
  }
  return undefined;
}
