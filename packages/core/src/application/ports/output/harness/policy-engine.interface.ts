/**
 * Deterministic permission policy (spec 119, docs/06).
 *
 * Rules come from the builtin default policy plus
 * `<repo>/.shep/harness/policies/*.yaml`. The engine only reports which rules
 * matched; precedence lives in the domain (`combineRuleEffects`).
 */
import type {
  ActionDescriptor,
  EffectDescriptor,
  ResourceDescriptor,
} from '../../../../domain/generated/output.js';
import type { RuleMatch } from '../../../../domain/harness/permission-precedence.js';

export interface PolicyRequest {
  action: ActionDescriptor;
  resources: ResourceDescriptor[];
  effects: EffectDescriptor[];
  repoRoot: string;
}

export interface PolicyRuleSummary {
  id: string;
  effect: string;
  hard: boolean;
  reason?: string;
  source: string;
}

export interface PolicyLoadIssue {
  file: string;
  message: string;
}

export interface IPolicyEngine {
  evaluate(request: PolicyRequest): Promise<RuleMatch[]>;
  /** Rules in effect for a repository (for UIs and doctor). */
  listRules(repoRoot: string): Promise<{ rules: PolicyRuleSummary[]; issues: PolicyLoadIssue[] }>;
  /** Human reason for a rule id, if the rule declares one. */
  reasonFor(ruleId: string, repoRoot: string): Promise<string | undefined>;
}

export interface CommandInspection {
  resources: ResourceDescriptor[];
  effects: EffectDescriptor[];
}

export interface ICommandInspector {
  inspect(command: string, cwd: string, repoRoot: string): CommandInspection;
}
