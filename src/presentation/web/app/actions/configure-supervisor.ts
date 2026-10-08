'use server';

import { resolve } from '@/lib/server-container';
import type { ConfigureSupervisorUseCase } from '@shepai/core/application/use-cases/agents/configure-supervisor.use-case';
import type { GetSupervisorPolicyUseCase } from '@shepai/core/application/use-cases/agents/get-supervisor-policy.use-case';
import type { EnableSupervisorUseCase } from '@shepai/core/application/use-cases/agents/enable-supervisor.use-case';
import type { DisableSupervisorUseCase } from '@shepai/core/application/use-cases/agents/disable-supervisor.use-case';
import { requireFeatureFlag } from '@/lib/feature-flags';
import type {
  GuardrailRule,
  SupervisorAutonomy,
  SupervisorPolicy,
  SupervisorScopeType,
} from '@shepai/core/domain/generated/output';

export interface ConfigureSupervisorActionInput {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
  autonomyLevel: SupervisorAutonomy;
  modelId?: string;
  promptVersion?: string;
  gateAuthority?: Partial<Record<'prd' | 'plan' | 'merge', SupervisorAutonomy>>;
  /**
   * Deterministic guardrail rules evaluated before the LLM evaluator.
   * When supplied, this replaces the previously stored rule set.
   */
  guardrailRules?: GuardrailRule[];
}

export interface ConfigureSupervisorActionResult {
  ok: boolean;
  policy?: SupervisorPolicy;
  error?: string;
}

export async function configureSupervisor(
  input: ConfigureSupervisorActionInput
): Promise<ConfigureSupervisorActionResult> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<ConfigureSupervisorUseCase>('ConfigureSupervisorUseCase');
    const policy = await useCase.execute({
      ...input,
      scopeType: input.scopeType as SupervisorScopeType,
    });
    return { ok: true, policy };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to configure supervisor';
    return { ok: false, error: message };
  }
}

export async function getSupervisorPolicy(input: {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
}): Promise<{ ok: true; policy: SupervisorPolicy | null } | { ok: false; error: string }> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<GetSupervisorPolicyUseCase>('GetSupervisorPolicyUseCase');
    const policy = await useCase.execute(input);
    return { ok: true, policy };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load supervisor policy';
    return { ok: false, error: message };
  }
}

export async function enableSupervisor(input: {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
}): Promise<ConfigureSupervisorActionResult> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<EnableSupervisorUseCase>('EnableSupervisorUseCase');
    const policy = await useCase.execute(input);
    return { ok: true, policy };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enable supervisor';
    return { ok: false, error: message };
  }
}

export async function disableSupervisor(input: {
  scopeType: string;
  scopeId?: string;
  featureId?: string;
}): Promise<ConfigureSupervisorActionResult> {
  try {
    requireFeatureFlag('collaboration');
    const useCase = resolve<DisableSupervisorUseCase>('DisableSupervisorUseCase');
    const policy = await useCase.execute(input);
    return { ok: true, policy };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disable supervisor';
    return { ok: false, error: message };
  }
}
