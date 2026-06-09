/**
 * Security Policy Validator
 *
 * Validates a parsed security policy object against the expected schema.
 * Checks required fields, valid enum values, contradictory rules,
 * and reasonable input limits. Returns structured validation results
 * with per-field error messages.
 */

import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '../../../domain/generated/output.js';
import type { PolicyValidationResult } from '../../../application/ports/output/services/security-policy-service.interface.js';

/** Maximum number of action disposition entries allowed */
const MAX_ACTION_DISPOSITIONS = 100;

/** Maximum number of entries in allowlist or denylist */
const MAX_LIST_ENTRIES = 100;

const VALID_MODES = Object.values(SecurityMode);
const VALID_CATEGORIES = Object.values(SecurityActionCategory);
const VALID_DISPOSITIONS = Object.values(SecurityActionDisposition);

/**
 * Validates parsed security policy objects against the expected schema.
 */
export class SecurityPolicyValidator {
  /**
   * Validate a parsed policy object.
   *
   * @param policy - The parsed policy object (from YAML)
   * @returns Validation result with errors array
   */
  validate(policy: Record<string, unknown>): PolicyValidationResult {
    const errors: string[] = [];

    // Validate mode (optional, but if present must be valid)
    if (policy.mode !== undefined) {
      if (!VALID_MODES.includes(policy.mode as SecurityMode)) {
        errors.push(
          `Invalid mode: "${String(policy.mode)}". Valid values: ${VALID_MODES.join(', ')}`
        );
      }
    }

    // Validate actionDispositions (optional, but if present must be valid)
    if (policy.actionDispositions !== undefined) {
      this.validateActionDispositions(policy.actionDispositions, errors);
    }

    // Validate dependencyRules (optional, but if present must be valid)
    if (policy.dependencyRules !== undefined) {
      this.validateDependencyRules(policy.dependencyRules, errors);
    }

    // Validate releaseRules (optional, but if present must be valid)
    if (policy.releaseRules !== undefined) {
      this.validateReleaseRules(policy.releaseRules, errors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateActionDispositions(value: unknown, errors: string[]): void {
    if (!Array.isArray(value)) {
      errors.push('actionDispositions must be an array');
      return;
    }

    if (value.length > MAX_ACTION_DISPOSITIONS) {
      errors.push(
        `actionDispositions exceeds limit: ${value.length} entries (max ${MAX_ACTION_DISPOSITIONS})`
      );
      return;
    }

    // Track categories to detect contradictions
    const categoryToDisposition = new Map<string, string>();

    for (let i = 0; i < value.length; i++) {
      const entry = value[i] as Record<string, unknown>;

      if (!entry || typeof entry !== 'object') {
        errors.push(`actionDispositions[${i}] must be an object`);
        continue;
      }

      const category = entry.category as string;
      const disposition = entry.disposition as string;

      if (!VALID_CATEGORIES.includes(category as SecurityActionCategory)) {
        errors.push(
          `actionDispositions[${i}].category: invalid value "${String(category)}". Valid values: ${VALID_CATEGORIES.join(', ')}`
        );
      }

      if (!VALID_DISPOSITIONS.includes(disposition as SecurityActionDisposition)) {
        errors.push(
          `actionDispositions[${i}].disposition: invalid value "${String(disposition)}". Valid values: ${VALID_DISPOSITIONS.join(', ')}`
        );
      }

      // Check for contradictory entries (same category, different disposition)
      if (
        VALID_CATEGORIES.includes(category as SecurityActionCategory) &&
        VALID_DISPOSITIONS.includes(disposition as SecurityActionDisposition)
      ) {
        const existing = categoryToDisposition.get(category);
        if (existing !== undefined && existing !== disposition) {
          errors.push(
            `Contradictory action dispositions for category "${category}": "${existing}" vs "${disposition}"`
          );
        } else {
          categoryToDisposition.set(category, disposition);
        }
      }
    }
  }

  private validateDependencyRules(value: unknown, errors: string[]): void {
    if (!value || typeof value !== 'object') {
      errors.push('dependencyRules must be an object');
      return;
    }

    const rules = value as Record<string, unknown>;

    // Validate boolean fields
    const booleanFields = [
      'checkLockfileConsistency',
      'checkLifecycleScripts',
      'checkNonRegistrySource',
      'enforceStrictVersionRanges',
    ] as const;

    for (const field of booleanFields) {
      if (rules[field] !== undefined && typeof rules[field] !== 'boolean') {
        errors.push(`dependencyRules.${field} must be a boolean, got ${typeof rules[field]}`);
      }
    }

    // Validate list fields
    if (rules.allowlist !== undefined) {
      this.validateStringList('dependencyRules.allowlist', rules.allowlist, errors);
    }

    if (rules.denylist !== undefined) {
      this.validateStringList('dependencyRules.denylist', rules.denylist, errors);
    }
  }

  private validateReleaseRules(value: unknown, errors: string[]): void {
    if (!value || typeof value !== 'object') {
      errors.push('releaseRules must be an object');
      return;
    }

    const rules = value as Record<string, unknown>;

    const booleanFields = [
      'requireCiOnlyPublishing',
      'requireProvenance',
      'checkWorkflowIntegrity',
    ] as const;

    for (const field of booleanFields) {
      if (rules[field] !== undefined && typeof rules[field] !== 'boolean') {
        errors.push(`releaseRules.${field} must be a boolean, got ${typeof rules[field]}`);
      }
    }
  }

  private validateStringList(path: string, value: unknown, errors: string[]): void {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }

    if (value.length > MAX_LIST_ENTRIES) {
      errors.push(`${path} exceeds limit: ${value.length} entries (max ${MAX_LIST_ENTRIES})`);
    }

    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string') {
        errors.push(`${path}[${i}] must be a string`);
      }
    }
  }
}

/** @alias SecurityPolicyValidator — kept for backwards compat */
export const SupplyChainSecurityPolicyValidator = SecurityPolicyValidator;
export type SupplyChainSecurityPolicyValidator = SecurityPolicyValidator;
