/**
 * ResolveHarnessPermissionUseCase (spec 119, F5): allow or deny a pending
 * request, with a scope and an optional note that goes back to the agent.
 * The waiting runtime (in any process) picks the answer up from the store.
 */
import { inject, injectable } from 'tsyringe';
import {
  PermissionEffect,
  type GrantScope,
  type PermissionDecision,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IHarnessEventLog,
  type IHarnessPermissionRepository,
  type IPolicyEngine,
} from '../../ports/output/harness/index.js';
import { PermissionService } from '../../services/harness/permission-service.js';

export interface ResolveHarnessPermissionInput {
  id: string;
  allow: boolean;
  scope?: GrantScope;
  note?: string;
  resolvedBy?: string;
}

@injectable()
export class ResolveHarnessPermissionUseCase {
  private readonly service: PermissionService;

  constructor(
    @inject(HARNESS_TOKENS.PolicyEngine) policy: IPolicyEngine,
    @inject(HARNESS_TOKENS.PermissionRepository) repo: IHarnessPermissionRepository,
    @inject(HARNESS_TOKENS.EventLog) events: IHarnessEventLog
  ) {
    this.service = new PermissionService(policy, repo, events);
  }

  execute(input: ResolveHarnessPermissionInput): Promise<PermissionDecision> {
    const note = input.note?.trim();
    return this.service.resolve({
      id: input.id,
      effect: input.allow ? PermissionEffect.Allow : PermissionEffect.Deny,
      ...(input.scope && { scope: input.scope }),
      ...(note && { note }),
      resolvedBy: input.resolvedBy ?? 'user',
    });
  }
}
