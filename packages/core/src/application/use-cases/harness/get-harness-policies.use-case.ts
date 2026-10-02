/**
 * GetHarnessPoliciesUseCase (spec 119): the effective permission rules for a
 * repository (shep defaults plus `.shep/harness/policies/*.yaml`) and any
 * files that failed to parse.
 */
import { inject, injectable } from 'tsyringe';
import {
  HARNESS_TOKENS,
  type IPolicyEngine,
  type PolicyLoadIssue,
  type PolicyRuleSummary,
} from '../../ports/output/harness/index.js';

export interface GetHarnessPoliciesInput {
  repoRoot: string;
}

export interface HarnessPolicies {
  rules: PolicyRuleSummary[];
  issues: PolicyLoadIssue[];
}

@injectable()
export class GetHarnessPoliciesUseCase {
  constructor(@inject(HARNESS_TOKENS.PolicyEngine) private readonly policy: IPolicyEngine) {}

  execute(input: GetHarnessPoliciesInput): Promise<HarnessPolicies> {
    return this.policy.listRules(input.repoRoot);
  }
}
