/**
 * Security Violation Error
 *
 * Thrown when a security policy constraint is violated during agent execution.
 * Contains structured information about the violated rule, the action category,
 * and actionable remediation guidance.
 */

import type { SecurityActionCategory } from '../generated/output';

export class SecurityViolationError extends Error {
  constructor(
    public readonly rule: string,
    public readonly category: SecurityActionCategory,
    public readonly remediation: string
  ) {
    super(`Security policy violation: ${rule}`);
    this.name = 'SecurityViolationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
