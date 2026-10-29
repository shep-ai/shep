import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BuildEvidenceBundleUseCase } from '@/application/use-cases/harness-learning/build-evidence-bundle.use-case.js';
import {
  EvidenceLeakError,
  assertEvidenceAllowed,
  renderTrajectory,
} from '@/application/use-cases/harness-learning/evidence-render.js';
import { SelectHarnessLessonsUseCase } from '@/application/use-cases/harness-learning/select-harness-lessons.use-case.js';
import type { ReflectOnFeatureRunInput } from '@/application/use-cases/harness-learning/reflection.types.js';
import { InMemoryLearnedHarnessRepository } from '../../../../helpers/harness-learning.fakes.js';
import {
  AgentType,
  HarnessOrigin,
  LearnedHarnessStatus,
  LessonConfidence,
  MemoryScope,
  type AgentSession,
} from '@/domain/generated/output.js';

const INPUT: ReflectOnFeatureRunInput = {
  featureId: 'feat-1',
  repositoryPath: '/repos/app',
  worktreePath: '/wt/feat-1',
  agentType: AgentType.ClaudeCode,
  signals: {
    merged: false,
    ciStatus: 'failure',
    ciFixAttempts: 2,
    ciFixHistory: [
      { attempt: 1, startedAt: 't', failureSummary: 'lint: unused import', outcome: 'failed' },
    ],
    rejectionFeedback: ['The plan skipped the migration'],
    validationRepairs: 1,
    lastValidationErrors: ['tasks[0].acceptanceCriteria missing'],
    error: 'CI-fix attempts exhausted',
  },
};

const SESSION: AgentSession = {
  id: 's1',
  agentType: AgentType.ClaudeCode,
  projectPath: '/wt/feat-1',
  messageCount: 2,
  messages: [
    { uuid: 'u1', role: 'user', content: 'Implement it', timestamp: new Date(0) },
    { uuid: 'u2', role: 'assistant', content: 'Ran pnpm test', timestamp: new Date(0) },
  ],
  firstMessageAt: new Date(0),
} as AgentSession;

function build(sessionList: AgentSession[] = [SESSION]) {
  const repo = new InMemoryLearnedHarnessRepository();
  const sessionRepo = {
    list: vi.fn(async () => sessionList),
    findById: vi.fn(async (id: string) => sessionList.find((s) => s.id === id) ?? null),
  };
  const useCase = new BuildEvidenceBundleUseCase(
    {
      findById: vi.fn(async () => ({
        name: 'Add audit log',
        description: 'Record admin actions',
        userQuery: 'add an audit log',
      })),
    } as never,
    {
      findByFeatureId: vi.fn(async () => [
        {
          phase: 'implement',
          startedAt: new Date(1),
          durationMs: 60000,
          numTurns: 30,
          costUsd: 1.5,
          exitCode: '0',
        },
        { phase: 'analyze', startedAt: new Date(0), durationMs: 5000, numTurns: 4, costUsd: 0.1 },
      ]),
    } as never,
    { getRepository: vi.fn(() => sessionRepo) } as never,
    repo,
    new SelectHarnessLessonsUseCase(repo, {
      score: vi.fn(async (_q: unknown, entries: { id: string }[]) =>
        entries.map((entry) => ({ entry, score: 1 }))
      ),
    } as never)
  );
  return { useCase, repo, sessionRepo };
}

describe('BuildEvidenceBundleUseCase', () => {
  it('renders the request, the run signals, the phases and the trajectories', async () => {
    const { useCase, sessionRepo } = build();
    const files = await useCase.execute(INPUT, { repositoryPath: '/repos/app' });
    expect(files['task.md']).toContain('add an audit log');
    expect(files['run/signals.md']).toContain('CI-fix attempts: 2');
    expect(files['run/signals.md']).toContain('The plan skipped the migration');
    expect(files['run/signals.md']).toContain('lint: unused import');
    expect(files['run/phases.md'].indexOf('analyze')).toBeLessThan(
      files['run/phases.md'].indexOf('implement')
    );
    expect(files['trajectories/01-s1.md']).toContain('[ACTION]\nRan pnpm test');
    expect(sessionRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/wt/feat-1' })
    );
  });

  it('includes lessons and rejected candidates in the library index', async () => {
    const { useCase, repo } = build();
    await repo.createLesson({
      id: 'l1',
      scope: MemoryScope.Project,
      repositoryPath: '/repos/app',
      cue: 'a migration adds a column',
      lesson: 'add a migration skill',
      evidence: 'row 1',
      confidence: LessonConfidence.Low,
      sourceFeatureId: 'f0',
      versionId: 'v0',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    await repo.createVersion({
      id: 'v9',
      scope: MemoryScope.Project,
      repositoryPath: '/repos/app',
      status: LearnedHarnessStatus.Rejected,
      origin: HarnessOrigin.Reflect,
      components: [],
      notes: 'added a giant always-on checklist',
      statusReason: 'too long',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const files = await useCase.execute(INPUT, { repositoryPath: '/repos/app' });
    expect(files['library/INDEX.md']).toContain('add a migration skill');
    expect(files['library/INDEX.md']).toContain('too long');
  });

  it('still builds evidence when transcripts cannot be read', async () => {
    const { useCase, sessionRepo } = build();
    sessionRepo.list.mockRejectedValueOnce(new Error('no transcripts'));
    const files = await useCase.execute(INPUT, { repositoryPath: '/repos/app' });
    expect(Object.keys(files).some((p) => p.startsWith('trajectories/'))).toBe(false);
  });

  it('is deterministic for the same records', async () => {
    const a = await build().useCase.execute(INPUT, { repositoryPath: '/repos/app' });
    const b = await build().useCase.execute(INPUT, { repositoryPath: '/repos/app' });
    expect(a).toEqual(b);
  });
});

describe('evidence rendering', () => {
  it('refuses entries outside the allowlist', () => {
    expect(() => assertEvidenceAllowed({ 'task.md': 'x', 'review/score.md': '9/10' })).toThrow(
      EvidenceLeakError
    );
    expect(() => assertEvidenceAllowed({ 'pool/inv1/harness/x.md': 'x' })).not.toThrow();
  });

  it('keeps the head and tail of a long trajectory', () => {
    const long = {
      ...SESSION,
      messages: [
        {
          uuid: 'u',
          role: 'assistant',
          content: `${'a'.repeat(30000)}${'z'.repeat(30000)}`,
          timestamp: new Date(0),
        },
      ],
    } as AgentSession;
    const text = renderTrajectory(long, 20000);
    expect(text).toContain('characters omitted');
    expect(text).toContain('aaaa');
    expect(text).toContain('zzzz');
    expect(text.length).toBeLessThan(21000);
  });
});
