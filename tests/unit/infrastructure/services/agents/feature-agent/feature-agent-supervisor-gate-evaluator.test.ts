/**
 * FeatureAgentSupervisorGateEvaluator — unit tests (spec 093, task 29).
 *
 * Verifies the three autonomy-routing branches end-to-end with the
 * stub supervisor executor:
 *  - advisory:    notification path proceeds; gate is NOT auto-closed.
 *  - co-sign:     same as advisory (gate stays open until both votes).
 *  - autonomous:  supervisor's approve/reject closes the gate via
 *                 ApproveAgentRunUseCase / RejectAgentRunUseCase with
 *                 actor = `supervisor:<id>`.
 *
 * Plus a "no policy" smoke test confirming the evaluator is a no-op
 * when no supervisor is configured for the scope, preserving the
 * pre-spec-093 behaviour (NFR-14).
 *
 * The supervisor decision use case under the hood is exercised with an
 * in-memory policy / decision repo and a stub executor so no LLM call
 * happens.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ApproveAgentRunUseCase } from '@/application/use-cases/agents/approve-agent-run.use-case.js';
import { ConfigureSupervisorUseCase } from '@/application/use-cases/agents/configure-supervisor.use-case.js';
import { EvaluateSupervisorDecisionUseCase } from '@/application/use-cases/agents/evaluate-supervisor-decision.use-case.js';
import { GetSupervisorPolicyUseCase } from '@/application/use-cases/agents/get-supervisor-policy.use-case.js';
import { RejectAgentRunUseCase } from '@/application/use-cases/agents/reject-agent-run.use-case.js';
import {
  FeatureAgentSupervisorGateEvaluator,
  resolveEffectiveAutonomy,
} from '@/infrastructure/services/agents/feature-agent/feature-agent-supervisor-gate-evaluator.js';
import { InMemorySupervisorAgent } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-agent.js';
import { InMemorySupervisorDecisionRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-decision-repository.js';
import { InMemorySupervisorPolicyRepository } from '@/infrastructure/adapters/in-memory/in-memory-supervisor-policy-repository.js';
import {
  AgentRunStatus,
  SupervisorAutonomy,
  SupervisorScopeType,
  SupervisorVerdict,
  type ActivityEntry,
  type AgentRun,
  type Application,
  type Settings,
  type SupervisorPolicy,
} from '@/domain/generated/output.js';
import type { IActivityLogRepository } from '@/application/ports/output/repositories/activity-log-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';

// Reject use case mocks fs / yaml — we stub them so the evaluator can
// drive the autonomous-reject path without touching disk.
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{}'),
}));
vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn().mockReturnValue({}),
    dump: vi.fn().mockReturnValue('yaml'),
  },
}));

class InMemoryActivityLog implements IActivityLogRepository {
  readonly entries: ActivityEntry[] = [];
  async create(entry: ActivityEntry): Promise<void> {
    this.entries.push({ ...entry });
  }
  async listByWorkItem(workItemId: string): Promise<ActivityEntry[]> {
    return this.entries.filter((e) => e.workItemId === workItemId).map((e) => ({ ...e }));
  }
}

function settingsRepo(collaboration: boolean): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue({ featureFlags: { collaboration } } as unknown as Settings),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function applicationRepo(app: Application | null): IApplicationRepository {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(app),
    findBySlug: vi.fn().mockResolvedValue(null),
    findByPath: vi.fn().mockResolvedValue(app),
    list: vi.fn().mockResolvedValue(app ? [app] : []),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  } as unknown as IApplicationRepository;
}

function makeApp(): Application {
  return {
    id: 'app-1',
    name: 'My App',
    slug: 'my-app',
  } as unknown as Application;
}

function waitingRun(): AgentRun {
  return {
    id: 'run-1',
    agentType: 'claude-code' as any,
    agentName: 'feature-agent',
    status: AgentRunStatus.waitingApproval,
    prompt: '...',
    threadId: 'thread-1',
    featureId: 'feat-1',
    repositoryPath: '/repo',
    approvalGates: { allowPrd: false, allowPlan: false, allowMerge: false },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeApprove(activityLog: IActivityLogRepository, runRepo: any, processService: any) {
  return new ApproveAgentRunUseCase(
    runRepo,
    processService,
    {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: 'feat-1',
        branch: 'feat/x',
        repositoryPath: '/repo',
        specPath: '/repo/.shep/wt/feat-x',
        worktreePath: '/repo/.shep/wt/feat-x',
      }),
      findBySlug: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any,
    {
      save: vi.fn(),
      update: vi.fn(),
      updateApprovalWait: vi.fn(),
      findByRunId: vi.fn().mockResolvedValue([]),
      findByFeatureId: vi.fn(),
    } as any,
    { getWorktreePath: vi.fn().mockReturnValue('/wt') },
    { writeSpecFileAtomic: vi.fn(), safeYamlDump: vi.fn().mockReturnValue('yaml') },
    activityLog
  );
}

function makeReject(activityLog: IActivityLogRepository, runRepo: any, processService: any) {
  return new RejectAgentRunUseCase(
    runRepo,
    processService,
    {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue({
        id: 'feat-1',
        branch: 'feat/x',
        repositoryPath: '/repo',
        specPath: '/repo/.shep/wt/feat-x',
        worktreePath: '/repo/.shep/wt/feat-x',
        push: false,
        openPr: false,
      }),
      findBySlug: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as any,
    {
      save: vi.fn(),
      update: vi.fn(),
      updateApprovalWait: vi.fn(),
      findByRunId: vi.fn().mockResolvedValue([]),
      findByFeatureId: vi.fn(),
    } as any,
    { getWorktreePath: vi.fn().mockReturnValue('/wt') },
    { writeSpecFileAtomic: vi.fn(), safeYamlDump: vi.fn().mockReturnValue('yaml') },
    { recordLifecycleEvent: vi.fn().mockResolvedValue(undefined) },
    activityLog
  );
}

interface EvaluatorBundle {
  evaluator: FeatureAgentSupervisorGateEvaluator;
  activityLog: InMemoryActivityLog;
  policyRepo: InMemorySupervisorPolicyRepository;
  decisionRepo: InMemorySupervisorDecisionRepository;
  approveSpy: ReturnType<typeof vi.spyOn>;
  rejectSpy: ReturnType<typeof vi.spyOn>;
  runRepo: any;
}

function buildEvaluator(opts: {
  collaboration: boolean;
  verdict: SupervisorVerdict;
}): EvaluatorBundle {
  const policyRepo = new InMemorySupervisorPolicyRepository();
  const decisionRepo = new InMemorySupervisorDecisionRepository();
  const activityLog = new InMemoryActivityLog();
  const supervisorAgent = new InMemorySupervisorAgent({
    verdicts: {
      gate: { verdict: opts.verdict, rationale: 'stub' },
      question: { verdict: opts.verdict, rationale: 'stub' },
      message: { verdict: opts.verdict, rationale: 'stub' },
    },
  });
  const getPolicy = new GetSupervisorPolicyUseCase(policyRepo);
  const evaluateDecision = new EvaluateSupervisorDecisionUseCase(
    supervisorAgent,
    decisionRepo,
    activityLog,
    settingsRepo(opts.collaboration),
    getPolicy,
    { execute: vi.fn().mockResolvedValue({ escalated: false }) } as any
  );

  const runRepo = {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(waitingRun()),
    findByThreadId: vi.fn(),
    findLatestByFeatureId: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn(),
    findRunningByPid: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  };
  const processService = {
    spawn: vi.fn().mockReturnValue(123),
    isAlive: vi.fn().mockReturnValue(true),
    checkAndMarkCrashed: vi.fn(),
  };
  const approve = makeApprove(activityLog, runRepo, processService);
  const reject = makeReject(activityLog, runRepo, processService);
  const approveSpy = vi.spyOn(approve, 'execute');
  const rejectSpy = vi.spyOn(reject, 'execute');

  const evaluator = new FeatureAgentSupervisorGateEvaluator(
    applicationRepo(makeApp()),
    getPolicy,
    evaluateDecision,
    approve,
    reject
  );

  return { evaluator, activityLog, policyRepo, decisionRepo, approveSpy, rejectSpy, runRepo };
}

async function configurePolicy(
  policyRepo: InMemorySupervisorPolicyRepository,
  autonomy: SupervisorAutonomy
): Promise<void> {
  const configure = new ConfigureSupervisorUseCase(policyRepo);
  await configure.execute({
    scopeType: SupervisorScopeType.app,
    scopeId: 'app-1',
    autonomyLevel: autonomy,
  });
}

describe('FeatureAgentSupervisorGateEvaluator', () => {
  let bundle: EvaluatorBundle;

  describe('autonomous mode', () => {
    beforeEach(async () => {
      bundle = buildEvaluator({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);
    });

    it('auto-resolves the gate via ApproveAgentRunUseCase when verdict is approve', async () => {
      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
        interruptNode: 'plan',
      });

      expect(result.evaluated).toBe(true);
      expect(result.autoResolved).toBe(true);
      expect(result.effectiveAutonomy).toBe(SupervisorAutonomy.autonomous);
      expect(result.verdict).toBe(SupervisorVerdict.approve);

      expect(bundle.approveSpy).toHaveBeenCalledWith(
        'run-1',
        undefined,
        expect.objectContaining({ namespace: 'supervisor' })
      );
      // The activity log carries the supervisor:<id> actor namespace.
      const supEntries = bundle.activityLog.entries.filter((e) =>
        e.actorId?.startsWith('supervisor:')
      );
      expect(supEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('auto-rejects the gate via RejectAgentRunUseCase when verdict is reject', async () => {
      bundle = buildEvaluator({ collaboration: true, verdict: SupervisorVerdict.reject });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);

      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
      });

      expect(result.evaluated).toBe(true);
      expect(result.autoResolved).toBe(true);
      expect(result.verdict).toBe(SupervisorVerdict.reject);
      expect(bundle.rejectSpy).toHaveBeenCalled();
    });
  });

  describe('advisory mode', () => {
    it('records a decision but does NOT auto-resolve the gate', async () => {
      bundle = buildEvaluator({ collaboration: true, verdict: SupervisorVerdict.advise });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.advisory);

      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
      });

      expect(result.evaluated).toBe(true);
      expect(result.autoResolved).toBe(false);
      expect(result.effectiveAutonomy).toBe(SupervisorAutonomy.advisory);
      expect(bundle.approveSpy).not.toHaveBeenCalled();
      expect(bundle.rejectSpy).not.toHaveBeenCalled();
      // The decision was still persisted via EvaluateSupervisorDecisionUseCase.
      const decisions = await bundle.decisionRepo.listByScope('app', 'app-1', undefined);
      expect(decisions).toHaveLength(1);
    });
  });

  describe('co-sign mode', () => {
    it('records a decision but does NOT auto-resolve the gate', async () => {
      bundle = buildEvaluator({ collaboration: true, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.cosign);

      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
      });

      expect(result.evaluated).toBe(true);
      expect(result.autoResolved).toBe(false);
      expect(result.effectiveAutonomy).toBe(SupervisorAutonomy.cosign);
      expect(bundle.approveSpy).not.toHaveBeenCalled();
      expect(bundle.rejectSpy).not.toHaveBeenCalled();
    });
  });

  describe('no policy configured', () => {
    it('returns evaluated=false and never touches the gate', async () => {
      bundle = buildEvaluator({ collaboration: true, verdict: SupervisorVerdict.approve });
      // No configurePolicy() call — scope has no SupervisorPolicy.

      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
      });

      expect(result.evaluated).toBe(false);
      expect(result.autoResolved).toBe(false);
      expect(bundle.approveSpy).not.toHaveBeenCalled();
      expect(bundle.rejectSpy).not.toHaveBeenCalled();
    });
  });

  describe('flag off', () => {
    it('is a no-op when collaboration flag is off (NFR-14)', async () => {
      bundle = buildEvaluator({ collaboration: false, verdict: SupervisorVerdict.approve });
      await configurePolicy(bundle.policyRepo, SupervisorAutonomy.autonomous);

      const result = await bundle.evaluator.evaluateForGate({
        runId: 'run-1',
        featureId: 'feat-1',
        repositoryPath: '/repo',
      });

      // The use case short-circuits inside EvaluateSupervisorDecisionUseCase
      // (skippedReason='flag-off'), so the evaluator surfaces evaluated=false.
      expect(result.evaluated).toBe(false);
      expect(result.autoResolved).toBe(false);
    });
  });
});

describe('resolveEffectiveAutonomy', () => {
  function policy(overrides: Partial<SupervisorPolicy> = {}): SupervisorPolicy {
    return {
      id: 'p-1',
      scopeType: SupervisorScopeType.app,
      scopeId: 'app-1',
      featureId: undefined,
      enabled: true,
      autonomyLevel: SupervisorAutonomy.advisory,
      gateAuthorityJson: undefined,
      modelId: undefined,
      promptVersion: undefined,
      policyRulesJson: undefined,
      notificationOverridesJson: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as SupervisorPolicy;
  }

  it('falls back to the default autonomy when no override map is set', () => {
    expect(resolveEffectiveAutonomy(policy(), 'plan')).toBe(SupervisorAutonomy.advisory);
  });

  it('uses the per-gate override when present', () => {
    const p = policy({
      autonomyLevel: SupervisorAutonomy.advisory,
      gateAuthorityJson: JSON.stringify({ merge: SupervisorAutonomy.autonomous }),
    });
    expect(resolveEffectiveAutonomy(p, 'merge')).toBe(SupervisorAutonomy.autonomous);
    expect(resolveEffectiveAutonomy(p, 'plan')).toBe(SupervisorAutonomy.advisory);
  });

  it('ignores malformed JSON and returns the default', () => {
    const p = policy({ gateAuthorityJson: '{not json' });
    expect(resolveEffectiveAutonomy(p, 'merge')).toBe(SupervisorAutonomy.advisory);
  });

  it('ignores invalid override values and returns the default', () => {
    const p = policy({ gateAuthorityJson: JSON.stringify({ plan: 'wat' }) });
    expect(resolveEffectiveAutonomy(p, 'plan')).toBe(SupervisorAutonomy.advisory);
  });
});
