/**
 * Security Constraint Validator
 *
 * Pure function that validates security constraints against executor capabilities.
 * Reusable across all executor types. Throws SecurityViolationError in Enforce mode
 * when constraints are incompatible. Logs warnings in Advisory mode.
 */

import { SecurityMode, SecurityActionCategory } from '../../../../../domain/generated/output.js';
import type { SecurityConstraints } from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import { SecurityViolationError } from '../../../../../domain/errors/security-violation.error.js';

export interface ExecutorCapabilities {
  /** Whether this executor requires --dangerously-skip-permissions or equivalent */
  requiresPermissiveMode: boolean;
  /** Human-readable executor name for error messages */
  executorName: string;
}

/**
 * Validate security constraints against executor capabilities.
 *
 * @returns A warning message if Advisory mode detects an issue, or undefined if clean.
 * @throws SecurityViolationError in Enforce mode when constraints are incompatible.
 */
export function validateSecurityConstraints(
  constraints: SecurityConstraints | undefined,
  capabilities: ExecutorCapabilities
): string | undefined {
  if (!constraints) return undefined;
  if (constraints.mode === SecurityMode.Disabled) return undefined;

  if (constraints.sandboxLevel === 'strict' && capabilities.requiresPermissiveMode) {
    const rule = `Executor "${capabilities.executorName}" requires permissive mode but policy demands strict sandbox`;
    const remediation =
      'Either switch to an executor that supports strict sandboxing, or relax the sandbox policy to permissive.';

    if (constraints.mode === SecurityMode.Enforce) {
      throw new SecurityViolationError(rule, SecurityActionCategory.SandboxEscalation, remediation);
    }

    return `[security:advisory] ${rule}. ${remediation}`;
  }

  return undefined;
}
