/**
 * Self-learning end to end (spec 150, task-26).
 *
 * Real SQLite repositories, the real evidence workspace, improver adapter,
 * installer, run session and executor proxy; only the agent is a mock
 * executor that edits the workspace the way an improver agent would.
 *
 *   feature run ends → Reflect proposes a candidate with a skill → the inbox
 *   decision is answered Adopt → the next run's prompt and worktree receive
 *   the skill → rollback → the run after that gets neither.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import { createInMemoryDatabase } from '../../../helpers/database.helper.js';
import {
  fakeSettingsRepository,
  fakeSpaceContext,
} from '../../../helpers/harness-learning.fakes.js';
import { createTelemetryDouble } from '../../../helpers/telemetry.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteLearnedHarnessRepository } from '@/infrastructure/repositories/sqlite-learned-harness.repository.js';
import { SQLiteHarnessRefinementRepository } from '@/infrastructure/repositories/sqlite-harness-refinement.repository.js';
import { FileSystemEvidenceWorkspace } from '@/infrastructure/services/harness-learning/file-system-evidence-workspace.js';
import { AgentHarnessImprover } from '@/infrastructure/services/harness-learning/agent-harness-improver.js';
import { HarnessInstallerService } from '@/infrastructure/services/harness-learning/harness-installer.service.js';
import { LearnedHarnessRunSession } from '@/infrastructure/services/harness-learning/learned-harness-run-session.js';
import { LearnedHarnessExecutorProxy } from '@/infrastructure/services/harness-learning/learned-harness-executor.proxy.js';
import { ReflectOnFeatureRunUseCase } from '@/application/use-cases/harness-learning/reflect-on-feature-run.use-case.js';
import { OfferHarnessCandidateUseCase } from '@/application/use-cases/harness-learning/offer-harness-candidate.use-case.js';
import { AdoptHarnessVersionUseCase } from '@/application/use-cases/harness-learning/adopt-harness-version.use-case.js';
import { RejectHarnessVersionUseCase } from '@/application/use-cases/harness-learning/reject-harness-version.use-case.js';
import { ResolveHarnessDecisionUseCase } from '@/application/use-cases/harness-learning/resolve-harness-decision.use-case.js';
import { RollbackHarnessVersionUseCase } from '@/application/use-cases/harness-learning/rollback-harness-version.use-case.js';
import { GetCurrentHarnessUseCase } from '@/application/use-cases/harness-learning/get-current-harness.use-case.js';
import { LEARNED_SECTION_TITLE } from '@/domain/harness-learning/harness-install-plan.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import {
  AgentType,
  HarnessRefinementStatus,
  LearnedHarnessStatus,
  LearningMode,
  type Decision,
} from '@/domain/generated/output.js';

const SKILL_PATH = 'skills/migrations/SKILL.md';
const SKILL = [
  '---',
  'name: migrations',
  'description: Add a database column safely',
  '---',
  '1. Write the backfill before adding the NOT NULL constraint.',
].join('\n');
const EXPERIENCE = `<edits>
component: ${SKILL_PATH}
candidates: dom1, agg1
change: added a migration checklist
observed: CI failed twice on a missing backfill
verdict: helped
</edits>
<experience>
cue: a feature adds a NOT NULL column
lesson: write the backfill before the constraint
evidence: CI-fix history of this run
confidence: high
</experience>`;

/** The improver agent: edits the harness in its workspace, or writes the experience entry. */
function mockImproverAgent(): IAgentExecutor {
  return {
    agentType: AgentType.ClaudeCode,
    execute: vi.fn(async (prompt: string, options?: { cwd?: string }) => {
      if (prompt.includes('<edits>')) return { result: EXPERIENCE };
      const target = join(options!.cwd!, 'context', 'harness', ...SKILL_PATH.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, SKILL);
      return { result: '<notes>migrations skill: CI-fix 2 failed on the missing backfill</notes>' };
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn(() => false),
  } as unknown as IAgentExecutor;
}

/** The feature agent of a later run: records what each call was given. */
function featureAgent() {
  const calls: { prompt: string; systemPrompt?: string }[] = [];
  const executor = {
    agentType: AgentType.ClaudeCode,
    execute: vi.fn(async (prompt: string, options?: { systemPrompt?: string }) => {
      calls.push({
        prompt,
        ...(options?.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
      });
      return { result: 'done' };
    }),
    executeStream: vi.fn(),
    supportsFeature: vi.fn(() => false),
  } as unknown as IAgentExecutor;
  return { executor, calls };
}

describe('Self-learning loop (end to end)', () => {
  let db: Database.Database;
  let repoDir: string;
  const REPO = '/repos/shop';

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repoDir = mkdtempSync(join(tmpdir(), 'shep-loop-'));
  });

  afterEach(() => {
    db.close();
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('reflects, adopts through the decision, installs for the next run, and rolls back', async () => {
    const harnesses = new SQLiteLearnedHarnessRepository(db);
    const runs = new SQLiteHarnessRefinementRepository(db);
    const settings = fakeSettingsRepository({ learning: { mode: LearningMode.Reflect } });
    const telemetry = createTelemetryDouble();
    const settler = { settle: vi.fn(async () => undefined) };
    const adopt = new AdoptHarnessVersionUseCase(
      harnesses,
      { execute: vi.fn(async () => ({ recorded: 0 })) } as never,
      settler as never,
      telemetry
    );
    const reject = new RejectHarnessVersionUseCase(harnesses, settler as never, telemetry);
    const asked: Decision[] = [];
    const offer = new OfferHarnessCandidateUseCase(
      settings,
      { findByPath: vi.fn(async () => null) } as never,
      {
        execute: vi.fn(async (input: { decision: Decision }) => {
          asked.push(input.decision);
          return { enabled: true, question: { id: 'q1', decision: input.decision } };
        }),
      } as never,
      adopt,
      telemetry
    );
    const reflect = new ReflectOnFeatureRunUseCase(
      settings,
      { findById: vi.fn(async () => ({ name: 'Audit log' })) } as never,
      harnesses,
      runs,
      new AgentHarnessImprover({ getExecutor: async () => mockImproverAgent() } as never),
      new FileSystemEvidenceWorkspace(),
      { execute: vi.fn(async () => ({ 'task.md': 'Add an audit log table' })) } as never,
      fakeSpaceContext(),
      offer,
      { findByFeatureId: vi.fn(async () => [{ phase: 'implement' }]) } as never,
      telemetry
    );

    // 1. A failed feature run ends: Reflect files a candidate and asks a person.
    const reflected = await reflect.execute(
      {
        featureId: 'feat-1',
        repositoryPath: REPO,
        worktreePath: repoDir,
        agentType: AgentType.ClaudeCode,
        signals: {
          merged: false,
          ciFixAttempts: 2,
          ciFixHistory: [],
          rejectionFeedback: [],
          validationRepairs: 0,
          lastValidationErrors: [],
          error: 'CI failed',
        },
      },
      'run-1'
    );
    expect(reflected.status).toBe(HarnessRefinementStatus.Proposed);
    const candidateId = reflected.candidateVersionId!;
    expect((await harnesses.findVersion(candidateId))?.status).toBe(LearnedHarnessStatus.Candidate);
    expect(asked).toHaveLength(1);

    // 2. The person answers the inbox decision with Adopt.
    const question = asked[0].questions[0];
    const adoptOption = question.options.find((o) => o.label === 'Adopt')!;
    const resolved = await new ResolveHarnessDecisionUseCase(adopt, reject).execute(
      [{ questionId: question.id, optionIds: [adoptOption.id] }],
      'user:web'
    );
    expect(resolved).toBe(true);
    expect((await harnesses.findVersion(candidateId))?.status).toBe(LearnedHarnessStatus.Adopted);

    // 3. The next run of a feature in the repository gets the skill.
    const getCurrent = new GetCurrentHarnessUseCase(settings, harnesses, fakeSpaceContext());
    const noGit = vi.fn(async () => {
      throw new Error('not a git repository');
    });
    const nextRun = () => {
      const agent = featureAgent();
      const session = new LearnedHarnessRunSession(
        getCurrent,
        new HarnessInstallerService(noGit),
        REPO,
        () => undefined
      );
      return { ...agent, proxy: new LearnedHarnessExecutorProxy(agent.executor, session) };
    };
    const installed = join(repoDir, '.claude', 'skills', 'shep-learned-migrations', 'SKILL.md');

    const second = nextRun();
    await second.proxy.execute('Implement the feature', { cwd: repoDir });
    expect(existsSync(installed)).toBe(true);
    expect(second.calls[0].systemPrompt).toContain(LEARNED_SECTION_TITLE);
    expect(second.calls[0].systemPrompt).toContain('`shep-learned-migrations`');

    // 4. Rollback: the run after that gets neither the skill nor the section.
    const rolledBack = await new RollbackHarnessVersionUseCase(harnesses, telemetry).execute({
      repositoryPath: REPO,
    });
    expect(rolledBack.rolledBack).toBe(true);
    const freshWorktree = mkdtempSync(join(tmpdir(), 'shep-loop-next-'));
    try {
      const third = nextRun();
      await third.proxy.execute('Implement the feature', { cwd: freshWorktree });
      expect(third.calls[0].systemPrompt ?? '').not.toContain(LEARNED_SECTION_TITLE);
      expect(existsSync(join(freshWorktree, '.claude', 'skills', 'shep-learned-migrations'))).toBe(
        false
      );
    } finally {
      rmSync(freshWorktree, { recursive: true, force: true });
    }
  });
});
