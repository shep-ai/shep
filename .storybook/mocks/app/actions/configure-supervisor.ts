import type { GuardrailRule, SupervisorPolicy } from '@shepai/core/domain/generated/output';

interface ConfigureSupervisorActionInput {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
  guardrailRules?: GuardrailRule[];
}

interface ConfigureSupervisorActionResult {
  ok: boolean;
  policy?: SupervisorPolicy;
  error?: string;
}

export async function configureSupervisor(
  _input: ConfigureSupervisorActionInput
): Promise<ConfigureSupervisorActionResult> {
  return { ok: true };
}

export async function getSupervisorPolicy(_input: {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
}): Promise<{ ok: true; policy: SupervisorPolicy | null }> {
  return { ok: true, policy: null };
}

export async function enableSupervisor(
  _input: ConfigureSupervisorActionInput
): Promise<ConfigureSupervisorActionResult> {
  return { ok: true };
}

export async function disableSupervisor(
  _input: ConfigureSupervisorActionInput
): Promise<ConfigureSupervisorActionResult> {
  return { ok: true };
}
