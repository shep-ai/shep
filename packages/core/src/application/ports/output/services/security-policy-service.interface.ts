/**
 * Security Policy Service Interface
 *
 * Output port for the central security policy engine.
 * Implementations handle policy file reading, validation, merging
 * with persisted settings, and deterministic policy evaluation.
 *
 * Following Clean Architecture:
 * - Application and use-case layers depend on this interface
 * - Infrastructure layer provides the concrete implementation
 * - All consumers (CLI, runtime, CI, UI) resolve the same instance via DI
 */

import type {
  EffectivePolicySnapshot,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../../domain/generated/output.js';

/**
 * Result of validating a security policy file.
 */
export interface PolicyValidationResult {
  /** Whether the policy file is valid */
  valid: boolean;
  /** Per-field validation error messages (empty when valid) */
  errors: string[];
}

/**
 * Service interface for security policy evaluation.
 *
 * Implementations must:
 * - Read shep.security.yaml from the repository root
 * - Merge repository policy with persisted settings defaults
 * - Apply deterministic precedence (global defaults < repo policy)
 * - Cache effective policy per repository path
 * - Fail fast on invalid policy files with actionable errors
 */
export interface ISecurityPolicyService {
  /**
   * Evaluate and compute the effective security policy for a repository.
   *
   * Reads the policy file, merges with persisted settings defaults,
   * validates, and returns a deterministic snapshot. Re-evaluates
   * on every call (no cache).
   *
   * @param repositoryPath - Absolute path to the repository root
   * @returns Computed effective policy snapshot
   * @throws Error if the policy file exists but is invalid
   */
  evaluatePolicy(repositoryPath: string): Promise<EffectivePolicySnapshot>;

  /**
   * Get the effective security policy for a repository.
   *
   * Returns a cached snapshot if available, otherwise computes
   * and caches the result. Use evaluatePolicy() to force re-evaluation.
   *
   * @param repositoryPath - Absolute path to the repository root
   * @returns Cached or freshly computed effective policy snapshot
   * @throws Error if the policy file exists but is invalid
   */
  getEffectivePolicy(repositoryPath: string): Promise<EffectivePolicySnapshot>;

  /**
   * Validate a security policy file without computing effective policy.
   *
   * Parses and validates the file against the expected schema.
   * Returns a structured result with per-field error messages.
   *
   * @param filePath - Absolute path to the policy file
   * @returns Validation result with errors array
   */
  validatePolicyFile(filePath: string): Promise<PolicyValidationResult>;

  /**
   * Look up the enforcement disposition for a specific action category
   * within a given effective policy snapshot.
   *
   * @param policy - The effective policy snapshot to query
   * @param actionCategory - The action category to look up
   * @returns The disposition (Allowed, Denied, or ApprovalRequired)
   */
  getActionDisposition(
    policy: EffectivePolicySnapshot,
    actionCategory: SecurityActionCategory
  ): SecurityActionDisposition;
}
