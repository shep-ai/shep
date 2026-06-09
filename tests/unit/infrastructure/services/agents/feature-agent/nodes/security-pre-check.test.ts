/**
 * Security Pre-Check Tests
 *
 * Tests for the pre-execution security policy check in executeNode().
 * Verifies that nodes respect securityMode and actionDispositions
 * from FeatureAgentState.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect } from 'vitest';
import {
  classifyNodeAction,
  checkSecurityDisposition,
  resolveEffectiveSecurityMode,
} from '@/infrastructure/services/agents/feature-agent/nodes/security-pre-check.js';
import {
  SecurityActionCategory,
  SecurityActionDisposition,
  SecurityMode,
} from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// classifyNodeAction
// ---------------------------------------------------------------------------

describe('classifyNodeAction', () => {
  it('should return null for read-only nodes (requirements, research, plan, analyze)', () => {
    expect(classifyNodeAction('requirements')).toBeNull();
    expect(classifyNodeAction('research')).toBeNull();
    expect(classifyNodeAction('plan')).toBeNull();
    expect(classifyNodeAction('analyze')).toBeNull();
  });

  it('should classify implement as PackageScriptExec', () => {
    expect(classifyNodeAction('implement')).toBe(SecurityActionCategory.PackageScriptExec);
  });

  it('should classify fast-implement as PackageScriptExec', () => {
    expect(classifyNodeAction('fast-implement')).toBe(SecurityActionCategory.PackageScriptExec);
  });

  it('should classify merge as CiWorkflowModify', () => {
    expect(classifyNodeAction('merge')).toBe(SecurityActionCategory.CiWorkflowModify);
  });

  it('should classify ci-fix as CiWorkflowModify', () => {
    expect(classifyNodeAction('ci-fix')).toBe(SecurityActionCategory.CiWorkflowModify);
  });

  it('should classify evidence as PackageScriptExec', () => {
    expect(classifyNodeAction('evidence')).toBe(SecurityActionCategory.PackageScriptExec);
  });

  it('should return null for unknown node names', () => {
    expect(classifyNodeAction('unknown-node')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkSecurityDisposition
// ---------------------------------------------------------------------------

describe('checkSecurityDisposition', () => {
  it('should return "skip" when securityMode is Disabled', () => {
    const result = checkSecurityDisposition('implement', SecurityMode.Disabled, {});
    expect(result).toEqual({ action: 'skip' });
  });

  it('should return "skip" for read-only nodes regardless of mode', () => {
    const result = checkSecurityDisposition('requirements', SecurityMode.Enforce, {
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Denied,
    });
    expect(result).toEqual({ action: 'skip' });
  });

  it('should return "allow" when disposition is Allowed', () => {
    const result = checkSecurityDisposition('implement', SecurityMode.Enforce, {
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Allowed,
    });
    expect(result).toEqual({ action: 'allow' });
  });

  it('should return "deny" when disposition is Denied in Enforce mode', () => {
    const result = checkSecurityDisposition('implement', SecurityMode.Enforce, {
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Denied,
    });
    expect(result).toEqual({
      action: 'deny',
      category: SecurityActionCategory.PackageScriptExec,
      nodeName: 'implement',
    });
  });

  it('should return "warn" when disposition is Denied in Advisory mode', () => {
    const result = checkSecurityDisposition('implement', SecurityMode.Advisory, {
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Denied,
    });
    expect(result).toEqual({
      action: 'warn',
      category: SecurityActionCategory.PackageScriptExec,
      nodeName: 'implement',
    });
  });

  it('should return "approval_required" when disposition is ApprovalRequired in Enforce mode', () => {
    const result = checkSecurityDisposition('merge', SecurityMode.Enforce, {
      [SecurityActionCategory.CiWorkflowModify]: SecurityActionDisposition.ApprovalRequired,
    });
    expect(result).toEqual({
      action: 'approval_required',
      category: SecurityActionCategory.CiWorkflowModify,
      nodeName: 'merge',
    });
  });

  it('should return "warn" when disposition is ApprovalRequired in Advisory mode', () => {
    const result = checkSecurityDisposition('merge', SecurityMode.Advisory, {
      [SecurityActionCategory.CiWorkflowModify]: SecurityActionDisposition.ApprovalRequired,
    });
    expect(result).toEqual({
      action: 'warn',
      category: SecurityActionCategory.CiWorkflowModify,
      nodeName: 'merge',
    });
  });

  it('should return "allow" when no disposition is set for the category', () => {
    const result = checkSecurityDisposition('implement', SecurityMode.Enforce, {});
    expect(result).toEqual({ action: 'allow' });
  });

  it('should handle ci-fix node mapping to CiWorkflowModify', () => {
    const result = checkSecurityDisposition('ci-fix', SecurityMode.Enforce, {
      [SecurityActionCategory.CiWorkflowModify]: SecurityActionDisposition.Denied,
    });
    expect(result).toEqual({
      action: 'deny',
      category: SecurityActionCategory.CiWorkflowModify,
      nodeName: 'ci-fix',
    });
  });
});

describe('resolveEffectiveSecurityMode — supplyChainSecurity feature flag gate', () => {
  it('forces Disabled when the feature flag is false, regardless of state mode', () => {
    expect(resolveEffectiveSecurityMode(SecurityMode.Enforce, false)).toBe(SecurityMode.Disabled);
    expect(resolveEffectiveSecurityMode(SecurityMode.Advisory, false)).toBe(SecurityMode.Disabled);
    expect(resolveEffectiveSecurityMode(SecurityMode.Disabled, false)).toBe(SecurityMode.Disabled);
    expect(resolveEffectiveSecurityMode(undefined, false)).toBe(SecurityMode.Disabled);
  });

  it('honors the state mode when the feature flag is true', () => {
    expect(resolveEffectiveSecurityMode(SecurityMode.Enforce, true)).toBe(SecurityMode.Enforce);
    expect(resolveEffectiveSecurityMode(SecurityMode.Advisory, true)).toBe(SecurityMode.Advisory);
    expect(resolveEffectiveSecurityMode(SecurityMode.Disabled, true)).toBe(SecurityMode.Disabled);
  });

  it('defaults to Disabled when state has no mode set and flag is true', () => {
    expect(resolveEffectiveSecurityMode(undefined, true)).toBe(SecurityMode.Disabled);
  });

  it('composes with checkSecurityDisposition to skip all checks when flag is false', () => {
    // Even an Enforce/Denied state collapses to a skip when supplyChainSecurity is off.
    const effective = resolveEffectiveSecurityMode(SecurityMode.Enforce, false);
    const result = checkSecurityDisposition('implement', effective, {
      [SecurityActionCategory.PackageScriptExec]: SecurityActionDisposition.Denied,
    });
    expect(result).toEqual({ action: 'skip' });
  });
});
