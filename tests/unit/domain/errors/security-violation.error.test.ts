/**
 * SecurityViolationError Unit Tests
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import { SecurityActionCategory } from '@/domain/generated/output.js';
import { SecurityViolationError } from '@/domain/errors/security-violation.error.js';

describe('SecurityViolationError', () => {
  it('extends Error with correct name', () => {
    const err = new SecurityViolationError(
      'strict sandbox required',
      SecurityActionCategory.SandboxEscalation,
      'Use a strict executor'
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SecurityViolationError');
  });

  it('stores rule, category, and remediation fields', () => {
    const err = new SecurityViolationError(
      'dependency installation denied',
      SecurityActionCategory.DependencyInstall,
      'Remove the dependency or add to allowlist'
    );

    expect(err.rule).toBe('dependency installation denied');
    expect(err.category).toBe(SecurityActionCategory.DependencyInstall);
    expect(err.remediation).toBe('Remove the dependency or add to allowlist');
  });

  it('formats message with rule description', () => {
    const err = new SecurityViolationError(
      'CI workflow modification blocked',
      SecurityActionCategory.CiWorkflowModify,
      'Get approval first'
    );

    expect(err.message).toBe('Security policy violation: CI workflow modification blocked');
  });

  it('maintains proper prototype chain for instanceof checks', () => {
    const err = new SecurityViolationError('test', SecurityActionCategory.PublishRelease, 'test');

    expect(err instanceof SecurityViolationError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});
