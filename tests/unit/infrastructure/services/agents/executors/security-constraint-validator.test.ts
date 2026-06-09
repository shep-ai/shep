/**
 * Security Constraint Validator Unit Tests
 *
 * Tests for the pure validation function that checks executor capabilities
 * against security policy constraints.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityMode,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import {
  validateSecurityConstraints,
  type ExecutorCapabilities,
} from '@/infrastructure/services/agents/common/executors/security-constraint-validator.js';
import { SecurityViolationError } from '@/domain/errors/security-violation.error.js';
import type { SecurityConstraints } from '@/application/ports/output/agents/agent-executor.interface.js';

const PERMISSIVE_EXECUTOR: ExecutorCapabilities = {
  requiresPermissiveMode: true,
  executorName: 'test-executor',
};

const STRICT_EXECUTOR: ExecutorCapabilities = {
  requiresPermissiveMode: false,
  executorName: 'strict-executor',
};

function makeConstraints(overrides: Partial<SecurityConstraints> = {}): SecurityConstraints {
  return {
    mode: SecurityMode.Enforce,
    actionDispositions: {
      [SecurityActionCategory.DependencyInstall]: SecurityActionDisposition.Allowed,
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Allowed,
      [SecurityActionCategory.CiWorkflowModify]: SecurityActionDisposition.Allowed,
      [SecurityActionCategory.PublishRelease]: SecurityActionDisposition.Allowed,
      [SecurityActionCategory.SandboxEscalation]: SecurityActionDisposition.Denied,
    },
    sandboxLevel: 'permissive',
    ...overrides,
  };
}

describe('validateSecurityConstraints', () => {
  it('returns undefined when no constraints are provided', () => {
    const result = validateSecurityConstraints(undefined, PERMISSIVE_EXECUTOR);
    expect(result).toBeUndefined();
  });

  it('returns undefined when mode is Disabled', () => {
    const constraints = makeConstraints({ mode: SecurityMode.Disabled });
    const result = validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR);
    expect(result).toBeUndefined();
  });

  it('returns undefined when sandbox level is permissive (no conflict)', () => {
    const constraints = makeConstraints({
      mode: SecurityMode.Enforce,
      sandboxLevel: 'permissive',
    });
    const result = validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR);
    expect(result).toBeUndefined();
  });

  it('returns undefined when executor supports strict sandbox', () => {
    const constraints = makeConstraints({
      mode: SecurityMode.Enforce,
      sandboxLevel: 'strict',
    });
    const result = validateSecurityConstraints(constraints, STRICT_EXECUTOR);
    expect(result).toBeUndefined();
  });

  it('throws SecurityViolationError in Enforce mode with incompatible sandbox', () => {
    const constraints = makeConstraints({
      mode: SecurityMode.Enforce,
      sandboxLevel: 'strict',
    });

    expect(() => validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR)).toThrow(
      SecurityViolationError
    );

    try {
      validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR);
    } catch (err) {
      const violation = err as SecurityViolationError;
      expect(violation.name).toBe('SecurityViolationError');
      expect(violation.category).toBe(SecurityActionCategory.SandboxEscalation);
      expect(violation.rule).toContain('test-executor');
      expect(violation.rule).toContain('strict sandbox');
      expect(violation.remediation).toContain('strict sandboxing');
    }
  });

  it('returns warning string in Advisory mode with incompatible sandbox', () => {
    const constraints = makeConstraints({
      mode: SecurityMode.Advisory,
      sandboxLevel: 'strict',
    });

    const result = validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR);
    expect(result).toBeDefined();
    expect(result).toContain('[security:advisory]');
    expect(result).toContain('test-executor');
  });

  it('does not throw in Advisory mode with incompatible sandbox', () => {
    const constraints = makeConstraints({
      mode: SecurityMode.Advisory,
      sandboxLevel: 'strict',
    });

    expect(() => validateSecurityConstraints(constraints, PERMISSIVE_EXECUTOR)).not.toThrow();
  });
});
