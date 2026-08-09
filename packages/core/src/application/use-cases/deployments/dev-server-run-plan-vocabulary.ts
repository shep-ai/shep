/**
 * Pure result vocabulary for the dev-server run-plan use cases.
 *
 * Deliberately a LEAF module: it imports nothing but a domain type, so a
 * browser bundle can import `DevServerRunPlanStatus` and
 * `RunPlanOverrideField` as VALUES without dragging in tsyringe. The web
 * disclosure has to branch on `result.status` and key validation errors to
 * form fields, and the no-magic-values rule says it must do so against named
 * members rather than string literals — which is only possible if the enums
 * are reachable from a client component.
 *
 * The mapping helpers that need the target resolver live next door in
 * `dev-server-run-plan-results.ts`, which re-exports everything here so no
 * existing importer has to know about the split.
 */

import type { RunPlanSource } from '../../../domain/generated/output.js';

/** Outcome vocabulary shared by all three run-plan use cases. */
export enum DevServerRunPlanStatus {
  /** The operation completed. */
  Ok = 'ok',
  /** The target resolved, but no plan is cached for it. */
  NoPlan = 'no-plan',
  /** A committed `.shep/dev.json` outranks anything that could be written. */
  RepoConfigControlled = 'repo-config-controlled',
  /** The supplied override failed validation; nothing was written. */
  ValidationFailed = 'validation-failed',
  /** No such deployment target. */
  TargetNotFound = 'target-not-found',
  /** The target exists but its directory is gone from disk. */
  TargetPathMissing = 'target-path-missing',
  /** Several equally-specific targets matched. */
  TargetAmbiguous = 'target-ambiguous',
}

/** Fields an override can be rejected on. */
export enum RunPlanOverrideField {
  Command = 'command',
  Cwd = 'cwd',
  ExpectedPort = 'expectedPort',
}

export interface RunPlanOverrideValidationError {
  field: RunPlanOverrideField;
  message: string;
}

/** A persisted run plan in ready-to-render form. */
export interface DevServerRunPlanView {
  /** Directory the plan is keyed by and spawns relative to. */
  repoPath: string;
  command: string;
  cwd: string;
  source: RunPlanSource;
  packageManager?: string;
  expectedPort?: number;
  language?: string;
  framework?: string;
  setupCommands: string[];
  /**
   * The repository's config files have changed since the plan was produced.
   * Reported, never acted on: a pinned plan that could be overruled by a
   * heuristic would not be a pin (FR-15).
   */
  isStale: boolean;
}

/**
 * Explanation attached to any successful operation on a repository whose
 * `.shep/dev.json` is in charge — so a surface can say why a database plan is
 * not the last word without re-deriving the rule.
 */
export const REPO_CONFIG_CONTROLLED_NOTICE =
  'A committed .shep/dev.json controls this repository — it is re-read on every ' +
  'start and outranks any stored plan. Edit that file to change what runs.';
