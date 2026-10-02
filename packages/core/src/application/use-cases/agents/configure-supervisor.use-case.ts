/**
 * ConfigureSupervisorUseCase
 *
 * Creates or replaces a {@link SupervisorPolicy} for the
 * (scopeType, scopeId?, featureId?) scope. Validation is performed
 * before any persistence so callers see typed
 * {@link InvalidSupervisorPolicyError} rejections rather than partial
 * writes.
 *
 * Behaviour:
 *  - When no policy exists for the scope, a new row is inserted with
 *    `enabled = true` (callers explicitly disable via
 *    DisableSupervisorUseCase).
 *  - When a policy already exists for the scope, all configurable
 *    fields are replaced and `updatedAt` is bumped — `id` and
 *    `createdAt` are preserved.
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import type { ISupervisorPolicyRepository } from '../../ports/output/repositories/supervisor-policy-repository.interface.js';
import {
  GuardrailGateType,
  SupervisorAutonomy,
  type GuardrailRule,
  type SupervisorPolicy,
  type SupervisorScopeType,
} from '../../../domain/generated/output.js';
import { InvalidSupervisorPolicyError } from '../../../domain/errors/invalid-supervisor-policy.error.js';

/** Approval-gate keys recognised by gateAuthority overrides. */
const VALID_GATE_KEYS = ['prd', 'plan', 'merge'] as const;
type GateKey = (typeof VALID_GATE_KEYS)[number];

const VALID_AUTONOMY_VALUES = new Set<string>(Object.values(SupervisorAutonomy));

export interface SupervisorPolicyRule {
  ruleId: string;
  condition: string;
  action: string;
}

export interface ConfigureSupervisorInput {
  scopeType: SupervisorScopeType;
  scopeId?: string;
  featureId?: string;
  autonomyLevel: SupervisorAutonomy;
  modelId?: string;
  promptVersion?: string;
  gateAuthority?: Partial<Record<GateKey, SupervisorAutonomy>>;
  policyRules?: SupervisorPolicyRule[];
  /**
   * Deterministic bounds evaluated before the supervisor's LLM evaluator.
   * When supplied, these replace any previously configured rule set.
   */
  guardrailRules?: GuardrailRule[];
  notificationOverrides?: Record<string, boolean>;
}

@injectable()
export class ConfigureSupervisorUseCase {
  constructor(
    @inject('ISupervisorPolicyRepository')
    private readonly policyRepository: ISupervisorPolicyRepository
  ) {}

  async execute(input: ConfigureSupervisorInput): Promise<SupervisorPolicy> {
    validateInput(input);

    // Look up by exact scope so a feature-scoped configure does not pick up
    // a scope-level fallback row.
    const existing =
      input.featureId !== undefined
        ? await this.policyRepository.findByScopeAndFeature(
            input.scopeType,
            input.scopeId,
            input.featureId
          )
        : await this.policyRepository.findByScope(input.scopeType, input.scopeId);

    const now = new Date();
    const policy: SupervisorPolicy = {
      id: existing?.id ?? randomUUID(),
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      featureId: input.featureId,
      enabled: existing?.enabled ?? true,
      autonomyLevel: input.autonomyLevel,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      gateAuthorityJson:
        input.gateAuthority && Object.keys(input.gateAuthority).length > 0
          ? JSON.stringify(input.gateAuthority)
          : undefined,
      policyRulesJson:
        input.policyRules && input.policyRules.length > 0
          ? JSON.stringify(input.policyRules)
          : undefined,
      guardrailRulesJson:
        input.guardrailRules && input.guardrailRules.length > 0
          ? JSON.stringify(input.guardrailRules)
          : undefined,
      notificationOverridesJson:
        input.notificationOverrides && Object.keys(input.notificationOverrides).length > 0
          ? JSON.stringify(input.notificationOverrides)
          : undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await this.policyRepository.update(policy);
    } else {
      await this.policyRepository.create(policy);
    }
    return policy;
  }
}

function validateInput(input: ConfigureSupervisorInput): void {
  if (typeof input.scopeType !== 'string' || input.scopeType.trim().length === 0) {
    throw new InvalidSupervisorPolicyError('scopeType', 'must be a non-empty string');
  }
  if (input.featureId?.trim().length === 0) {
    throw new InvalidSupervisorPolicyError('featureId', 'must be a non-empty string when supplied');
  }
  if (!VALID_AUTONOMY_VALUES.has(input.autonomyLevel)) {
    throw new InvalidSupervisorPolicyError(
      'autonomyLevel',
      `must be one of ${[...VALID_AUTONOMY_VALUES].join(', ')}`
    );
  }
  if (input.gateAuthority) {
    for (const [gate, autonomy] of Object.entries(input.gateAuthority)) {
      if (!(VALID_GATE_KEYS as readonly string[]).includes(gate)) {
        throw new InvalidSupervisorPolicyError(
          `gateAuthority.${gate}`,
          `unknown gate key (expected one of ${VALID_GATE_KEYS.join(', ')})`
        );
      }
      if (autonomy === undefined || !VALID_AUTONOMY_VALUES.has(autonomy)) {
        throw new InvalidSupervisorPolicyError(
          `gateAuthority.${gate}`,
          `must be a valid SupervisorAutonomy`
        );
      }
    }
  }
  if (input.guardrailRules) {
    const validGates = new Set<string>(Object.values(GuardrailGateType));
    input.guardrailRules.forEach((rule, idx) => {
      const at = `guardrailRules[${idx}]`;
      if (!rule || typeof rule !== 'object') {
        throw new InvalidSupervisorPolicyError(at, 'must be an object');
      }
      if (typeof rule.id !== 'string' || rule.id.trim().length === 0) {
        throw new InvalidSupervisorPolicyError(`${at}.id`, 'must be a non-empty string');
      }
      if (!validGates.has(rule.gate)) {
        throw new InvalidSupervisorPolicyError(
          `${at}.gate`,
          `must be one of ${[...validGates].join(', ')}`
        );
      }
      if (typeof rule.autoApprove !== 'boolean') {
        throw new InvalidSupervisorPolicyError(`${at}.autoApprove`, 'must be a boolean');
      }
      for (const bound of ['maxDiffLines', 'maxFilesChanged'] as const) {
        const value = rule[bound];
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new InvalidSupervisorPolicyError(
            `${at}.${bound}`,
            'must be a non-negative integer when supplied'
          );
        }
      }
      if (
        rule.blockedPathPatterns !== undefined &&
        (!Array.isArray(rule.blockedPathPatterns) ||
          rule.blockedPathPatterns.some((pattern) => typeof pattern !== 'string'))
      ) {
        throw new InvalidSupervisorPolicyError(
          `${at}.blockedPathPatterns`,
          'must be an array of strings when supplied'
        );
      }
    });
  }
  if (input.policyRules) {
    input.policyRules.forEach((rule, idx) => {
      if (!rule || typeof rule !== 'object') {
        throw new InvalidSupervisorPolicyError(`policyRules[${idx}]`, 'must be an object');
      }
      if (typeof rule.ruleId !== 'string' || rule.ruleId.trim().length === 0) {
        throw new InvalidSupervisorPolicyError(
          `policyRules[${idx}].ruleId`,
          'must be a non-empty string'
        );
      }
      if (typeof rule.condition !== 'string') {
        throw new InvalidSupervisorPolicyError(`policyRules[${idx}].condition`, 'must be a string');
      }
      if (typeof rule.action !== 'string') {
        throw new InvalidSupervisorPolicyError(`policyRules[${idx}].action`, 'must be a string');
      }
    });
  }
}
