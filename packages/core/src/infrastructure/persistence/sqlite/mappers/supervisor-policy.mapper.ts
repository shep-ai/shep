/**
 * SupervisorPolicy Database Mapper
 *
 * Maps between SupervisorPolicy domain objects and SQLite rows for the
 * supervisor_policies table. Boolean stored as INTEGER 0/1.
 */

import type {
  SupervisorAutonomy,
  SupervisorPolicy,
  SupervisorScopeType,
} from '../../../../domain/generated/output.js';

export interface SupervisorPolicyRow {
  id: string;
  scope_type: string;
  scope_id: string | null;
  feature_id: string | null;
  enabled: number;
  autonomy_level: string;
  gate_authority_json: string | null;
  model_id: string | null;
  prompt_version: string | null;
  policy_rules_json: string | null;
  guardrail_rules_json: string | null;
  notification_overrides_json: string | null;
  created_at: number;
  updated_at: number;
}

function toMillis(value: SupervisorPolicy['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

export function toDatabase(policy: SupervisorPolicy): SupervisorPolicyRow {
  return {
    id: policy.id,
    scope_type: policy.scopeType,
    scope_id: policy.scopeId ?? null,
    feature_id: policy.featureId ?? null,
    enabled: policy.enabled ? 1 : 0,
    autonomy_level: policy.autonomyLevel,
    gate_authority_json: policy.gateAuthorityJson ?? null,
    model_id: policy.modelId ?? null,
    prompt_version: policy.promptVersion ?? null,
    policy_rules_json: policy.policyRulesJson ?? null,
    guardrail_rules_json: policy.guardrailRulesJson ?? null,
    notification_overrides_json: policy.notificationOverridesJson ?? null,
    created_at: toMillis(policy.createdAt),
    updated_at: toMillis(policy.updatedAt),
  };
}

export function fromDatabase(row: SupervisorPolicyRow): SupervisorPolicy {
  return {
    id: row.id,
    scopeType: row.scope_type as SupervisorScopeType,
    scopeId: row.scope_id ?? undefined,
    featureId: row.feature_id ?? undefined,
    enabled: row.enabled === 1,
    autonomyLevel: row.autonomy_level as SupervisorAutonomy,
    gateAuthorityJson: row.gate_authority_json ?? undefined,
    modelId: row.model_id ?? undefined,
    promptVersion: row.prompt_version ?? undefined,
    policyRulesJson: row.policy_rules_json ?? undefined,
    guardrailRulesJson: row.guardrail_rules_json ?? undefined,
    notificationOverridesJson: row.notification_overrides_json ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  } as SupervisorPolicy;
}
