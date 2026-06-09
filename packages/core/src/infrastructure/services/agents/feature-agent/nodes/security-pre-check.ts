/**
 * Security Pre-Check for Feature Agent Nodes
 *
 * Classifies node actions by SecurityActionCategory and evaluates
 * the effective disposition based on the security policy mode and
 * per-category overrides from FeatureAgentState.
 *
 * Used by executeNode() to enforce or warn about security policy
 * before executing agent prompts.
 */

import {
  SecurityActionCategory,
  SecurityActionDisposition,
  SecurityMode,
} from '@/domain/generated/output.js';

/** Map node names to the security action category they represent. */
const NODE_ACTION_MAP: Record<string, SecurityActionCategory> = {
  implement: SecurityActionCategory.PackageScriptExec,
  'fast-implement': SecurityActionCategory.PackageScriptExec,
  evidence: SecurityActionCategory.PackageScriptExec,
  merge: SecurityActionCategory.CiWorkflowModify,
  'ci-fix': SecurityActionCategory.CiWorkflowModify,
};

/**
 * Classify a node name into its SecurityActionCategory.
 * Returns null for read-only nodes (requirements, research, plan, analyze)
 * that have no security-sensitive actions.
 */
export function classifyNodeAction(nodeName: string): SecurityActionCategory | null {
  return NODE_ACTION_MAP[nodeName] ?? null;
}

/**
 * Resolve the effective SecurityMode for a node execution, honoring the
 * supplyChainSecurity master kill switch. When the feature flag is false,
 * the mode is forced to Disabled regardless of the mode stored in state.
 *
 * Extracted as a pure function so the gate can be unit-tested without
 * spinning up the full node-helpers infrastructure.
 *
 * @param stateMode - The security mode carried in FeatureAgentState (or undefined)
 * @param supplyChainSecurityEnabled - Value of the supplyChainSecurity feature flag
 * @returns SecurityMode.Disabled when the flag is off, otherwise the state mode
 *          (or Disabled when state has no mode set).
 */
export function resolveEffectiveSecurityMode(
  stateMode: SecurityMode | undefined,
  supplyChainSecurityEnabled: boolean
): SecurityMode {
  if (!supplyChainSecurityEnabled) {
    return SecurityMode.Disabled;
  }
  return stateMode ?? SecurityMode.Disabled;
}

/** Result of a security disposition check. */
export type SecurityCheckResult =
  | { action: 'skip' }
  | { action: 'allow' }
  | { action: 'warn'; category: SecurityActionCategory; nodeName: string }
  | { action: 'deny'; category: SecurityActionCategory; nodeName: string }
  | { action: 'approval_required'; category: SecurityActionCategory; nodeName: string };

/**
 * Check the security disposition for a node based on the effective policy.
 *
 * @param nodeName - The graph node name (e.g. 'implement', 'merge')
 * @param securityMode - Effective security mode from state
 * @param actionDispositions - Per-category disposition overrides from state
 * @returns The action to take: skip, allow, warn, deny, or approval_required
 */
export function checkSecurityDisposition(
  nodeName: string,
  securityMode: SecurityMode,
  actionDispositions: Partial<Record<SecurityActionCategory, SecurityActionDisposition>>
): SecurityCheckResult {
  // Disabled mode — no checks
  if (securityMode === SecurityMode.Disabled) {
    return { action: 'skip' };
  }

  // Read-only nodes have no security-sensitive actions
  const category = classifyNodeAction(nodeName);
  if (!category) {
    return { action: 'skip' };
  }

  // Look up the disposition for this category
  const disposition = actionDispositions[category];

  // No disposition configured — default to allow
  if (!disposition) {
    return { action: 'allow' };
  }

  if (disposition === SecurityActionDisposition.Allowed) {
    return { action: 'allow' };
  }

  if (disposition === SecurityActionDisposition.Denied) {
    // In Enforce mode, deny the action; in Advisory mode, just warn
    if (securityMode === SecurityMode.Enforce) {
      return { action: 'deny', category, nodeName };
    }
    return { action: 'warn', category, nodeName };
  }

  if (disposition === SecurityActionDisposition.ApprovalRequired) {
    // In Enforce mode, require approval; in Advisory mode, just warn
    if (securityMode === SecurityMode.Enforce) {
      return { action: 'approval_required', category, nodeName };
    }
    return { action: 'warn', category, nodeName };
  }

  return { action: 'allow' };
}
