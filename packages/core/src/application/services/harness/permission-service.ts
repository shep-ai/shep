/**
 * PermissionService (spec 119, docs/06, spec/state-machines/permission.md).
 *
 *   requested → deterministic policy → (grant lifts ask) → ask: wait for a
 *   person | non-interactive: configured effect → final decision persisted
 *
 * Every evaluation ends in exactly one persisted PermissionDecision. A hard
 * deny can never be approved, granted or overridden.
 */
import { randomUUID } from 'node:crypto';
import {
  GrantScope,
  HarnessEventType,
  PermissionEffect,
  PermissionRequestStatus,
  type ActionDescriptor,
  type EffectDescriptor,
  type HarnessPermissionsConfig,
  type PermissionDecision,
  type PermissionGrant,
  type ResourceDescriptor,
} from '../../../domain/generated/output.js';
import {
  applyGrant,
  combineRuleEffects,
  resolveAsk,
} from '../../../domain/harness/permission-precedence.js';
import type {
  IHarnessEventLog,
  IHarnessPermissionRepository,
  IPolicyEngine,
} from '../../ports/output/harness/index.js';

/** Who or what produced a final permission result. */
export const PermissionResolver = {
  Policy: 'policy',
  Grant: 'grant',
  User: 'user',
  Timeout: 'timeout',
  NonInteractive: 'non_interactive',
  Aborted: 'aborted',
} as const;

export const PermissionReason = {
  PolicyMatch: 'policy_match',
  DefaultUnknown: 'default_unknown',
  Grant: 'grant',
  User: 'user',
  ApprovalTimeout: 'approval_timeout',
  NonInteractive: 'non_interactive',
  Aborted: 'aborted',
} as const;

export const DEFAULT_PERMISSION_POLL_MS = 1000;

export interface PermissionRequest {
  sessionId: string;
  taskId: string;
  toolCallId?: string;
  action: ActionDescriptor;
  resources: ResourceDescriptor[];
  effects: EffectDescriptor[];
  repoRoot: string;
  /** Someone can answer an ask (UI/CLI attached); false for evals and --non-interactive. */
  interactive: boolean;
  config: HarnessPermissionsConfig;
  abortSignal?: AbortSignal;
  /** Called once the request is pending so the runtime can mark the task blocked. */
  onPending?: (pending: PermissionDecision) => Promise<void> | void;
}

export interface ResolvePermissionInput {
  id: string;
  effect: PermissionEffect.Allow | PermissionEffect.Deny;
  scope?: GrantScope;
  note?: string;
  resolvedBy?: string;
}

export class PermissionAlreadyResolvedError extends Error {
  constructor(id: string) {
    super(`Permission request ${id} is already resolved`);
    this.name = 'PermissionAlreadyResolvedError';
  }
}

export class HardDenyNotApprovableError extends Error {
  constructor(id: string) {
    super(`Permission request ${id} was denied by a hard policy rule and cannot be approved`);
    this.name = 'HardDenyNotApprovableError';
  }
}

export class PermissionNotFoundError extends Error {
  constructor(id: string) {
    super(`Permission request ${id} not found`);
    this.name = 'PermissionNotFoundError';
  }
}

/** Normalized action pattern a grant applies to. */
export function grantPattern(action: ActionDescriptor): string {
  return `${action.capabilityId}:${action.summary.trim().replace(/\s+/g, ' ')}`;
}

export class PermissionService {
  constructor(
    private readonly policy: IPolicyEngine,
    private readonly repo: IHarnessPermissionRepository,
    private readonly events: IHarnessEventLog,
    private readonly options: {
      pollMs?: number;
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    } = {}
  ) {}

  async evaluate(req: PermissionRequest): Promise<PermissionDecision> {
    const matches = await this.policy.evaluate({
      action: req.action,
      resources: req.resources,
      effects: req.effects,
      repoRoot: req.repoRoot,
    });
    const outcome = combineRuleEffects(matches, req.config.defaultUnknown);
    const now = new Date();
    const base: PermissionDecision = {
      id: randomUUID(),
      sessionId: req.sessionId,
      taskId: req.taskId,
      ...(req.toolCallId && { toolCallId: req.toolCallId }),
      action: req.action,
      resources: req.resources,
      effects: req.effects,
      result: outcome.effect,
      status: PermissionRequestStatus.Resolved,
      matchedRuleIds: outcome.matchedRuleIds,
      hard: outcome.hard,
      reasonCode: matches.length ? PermissionReason.PolicyMatch : PermissionReason.DefaultUnknown,
      resolvedBy: PermissionResolver.Policy,
      createdAt: now,
      updatedAt: now,
    };

    if (outcome.effect === PermissionEffect.Ask) {
      const grant = await this.matchingGrant(req);
      if (grant && applyGrant(outcome, true) === PermissionEffect.Allow) {
        if (grant.scope === GrantScope.Once) await this.repo.consumeGrant(grant.id);
        return this.finish({
          ...base,
          result: PermissionEffect.Allow,
          reasonCode: PermissionReason.Grant,
          resolvedBy: PermissionResolver.Grant,
          scope: grant.scope,
        });
      }
      const effect = resolveAsk(outcome.effect, req.interactive, req.config.nonInteractiveAsk);
      if (effect !== PermissionEffect.Ask) {
        return this.finish({
          ...base,
          result: effect,
          reasonCode: PermissionReason.NonInteractive,
          resolvedBy: PermissionResolver.NonInteractive,
        });
      }
      return this.waitForPerson(
        { ...base, status: PermissionRequestStatus.Pending, resolvedBy: undefined },
        req
      );
    }
    return this.finish(base);
  }

  /** Resolve a pending request on behalf of a person (UI, CLI). */
  async resolve(input: ResolvePermissionInput): Promise<PermissionDecision> {
    const pending = await this.repo.getPermission(input.id);
    if (!pending) throw new PermissionNotFoundError(input.id);
    if (pending.status !== PermissionRequestStatus.Pending)
      throw new PermissionAlreadyResolvedError(input.id);
    if (pending.hard && input.effect === PermissionEffect.Allow)
      throw new HardDenyNotApprovableError(input.id);
    const resolved: PermissionDecision = {
      ...pending,
      result: input.effect,
      status: PermissionRequestStatus.Resolved,
      reasonCode: PermissionReason.User,
      resolvedBy: input.resolvedBy ?? PermissionResolver.User,
      ...(input.scope && { scope: input.scope }),
      ...(input.note?.trim() && { note: input.note.trim() }),
      updatedAt: new Date(),
    };
    if (!(await this.repo.resolvePending(resolved)))
      throw new PermissionAlreadyResolvedError(input.id);
    if (input.effect === PermissionEffect.Allow && input.scope && input.scope !== GrantScope.Once) {
      await this.repo.putGrant({
        id: randomUUID(),
        sessionId: pending.sessionId,
        ...(input.scope === GrantScope.Task && { taskId: pending.taskId }),
        scope: input.scope,
        capabilityId: pending.action.capabilityId,
        actionPattern: grantPattern(pending.action),
        consumed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await this.emitResolved(resolved);
    return resolved;
  }

  private async matchingGrant(req: PermissionRequest): Promise<PermissionGrant | undefined> {
    const pattern = grantPattern(req.action);
    const grants = await this.repo.listActiveGrants(req.sessionId);
    return grants.find(
      (g) =>
        g.capabilityId === req.action.capabilityId &&
        g.actionPattern === pattern &&
        (g.scope !== GrantScope.Task || g.taskId === req.taskId)
    );
  }

  private async waitForPerson(
    pending: PermissionDecision,
    req: PermissionRequest
  ): Promise<PermissionDecision> {
    await this.repo.putPermission(pending);
    await this.events.append({
      sessionId: pending.sessionId,
      taskId: pending.taskId,
      type: HarnessEventType.PermissionRequested,
      payload: {
        permissionId: pending.id,
        summary: pending.action.summary,
        intent: pending.action.intent ?? null,
        effects: pending.effects.map((e) => e.description),
        matchedRuleIds: pending.matchedRuleIds,
      },
    });
    await req.onPending?.(pending);

    const sleep = this.options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const now = this.options.now ?? (() => Date.now());
    const deadline = now() + req.config.approvalTimeoutMs;
    const pollMs = this.options.pollMs ?? DEFAULT_PERMISSION_POLL_MS;
    for (;;) {
      const current = await this.repo.getPermission(pending.id);
      if (current && current.status === PermissionRequestStatus.Resolved) return current;
      const aborted = req.abortSignal?.aborted === true;
      if (aborted || now() >= deadline) {
        const closed: PermissionDecision = {
          ...pending,
          result: PermissionEffect.Deny,
          status: PermissionRequestStatus.Resolved,
          reasonCode: aborted ? PermissionReason.Aborted : PermissionReason.ApprovalTimeout,
          resolvedBy: aborted ? PermissionResolver.Aborted : PermissionResolver.Timeout,
          updatedAt: new Date(),
        };
        if (await this.repo.resolvePending(closed)) {
          await this.emitResolved(closed);
          return closed;
        }
        // Someone resolved it between our read and our write: their answer wins.
        const winner = await this.repo.getPermission(pending.id);
        if (winner) return winner;
      }
      await sleep(pollMs);
    }
  }

  private async finish(decision: PermissionDecision): Promise<PermissionDecision> {
    await this.repo.putPermission(decision);
    await this.emitResolved(decision);
    return decision;
  }

  private async emitResolved(decision: PermissionDecision): Promise<void> {
    await this.events.append({
      sessionId: decision.sessionId,
      taskId: decision.taskId,
      type: HarnessEventType.PermissionResolved,
      payload: {
        permissionId: decision.id,
        result: decision.result,
        resolvedBy: decision.resolvedBy ?? null,
        scope: decision.scope ?? null,
        hard: decision.hard,
      },
    });
  }
}
