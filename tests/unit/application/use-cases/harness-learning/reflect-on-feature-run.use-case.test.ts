import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ReflectOnFeatureRunUseCase } from '@/application/use-cases/harness-learning/reflect-on-feature-run.use-case.js';
import type { ReflectOnFeatureRunInput } from '@/application/use-cases/harness-learning/reflection.types.js';
import {
  InMemoryEvidenceWorkspace,
  InMemoryHarnessRefinementRepository,
  InMemoryLearnedHarnessRepository,
  ScriptedImprover,
  fakeSettingsRepository,
  fakeSpaceContext,
  type ImproverScript,
} from '../../../../helpers/harness-learning.fakes.js';
import {
  AgentType,
  HarnessEditVerdict,
  HarnessImproverStage,
  HarnessOrigin,
  HarnessRefinementStatus,
  LearnedHarnessStatus,
  LearningMode,
  LessonConfidence,
  MemoryScope,
} from '@/domain/generated/output.js';

const INPUT: ReflectOnFeatureRunInput = {
  featureId: 'feat-1',
  repositoryPath: '/repos/app',
  worktreePath: '/wt/feat-1',
  agentType: AgentType.ClaudeCode,
  signals: {
    merged: false,
    ciFixAttempts: 3,
    ciFixHistory: [],
    rejectionFeedback: [],
    validationRepairs: 0,
    lastValidationErrors: [],
  },
};

const SKILL = '---\nname: migrations\ndescription: Add a database column safely\n---\nSteps.';

const addSkill: ImproverScript = (_m, ws) => {
  ws.harness['skills/migrations/SKILL.md'] = SKILL;
  return {
    text: '<notes>added migrations skill — CI failed 3x on a missing backfill</notes>',
    costUsd: 0.5,
  };
};

const EXPERIENCE_REPLY = `<edits>
component: skills/migrations/SKILL.md
candidates: dom1, agg1
change: added a migration checklist
observed: CI-fix attempt 2 failed on the missing backfill
verdict: helped
</edits>
<experience>
cue: a feature adds a NOT NULL column
lesson: add a skill that writes the backfill before the constraint
evidence: row 1
confidence: high
</experience>`;

function build(
  options: {
    scripts?: Record<string, ImproverScript>;
    mode?: LearningMode;
    selfLearning?: boolean;
    timings?: { phase: string }[];
  } = {}
) {
  const harnesses = new InMemoryLearnedHarnessRepository();
  const runs = new InMemoryHarnessRefinementRepository();
  const workspace = new InMemoryEvidenceWorkspace();
  const improver = new ScriptedImprover(workspace, options.scripts ?? {});
  const offer = { execute: vi.fn(async () => ({ autoAdopted: false, findings: [] })) };
  const useCase = new ReflectOnFeatureRunUseCase(
    fakeSettingsRepository({
      selfLearning: options.selfLearning ?? true,
      learning: { mode: options.mode ?? LearningMode.Reflect },
    }),
    { findById: vi.fn(async () => ({ name: 'Add audit log' })) } as never,
    harnesses,
    runs,
    improver,
    workspace,
    { execute: vi.fn(async () => ({ 'task.md': 'add an audit log' })) } as never,
    fakeSpaceContext(),
    offer as never,
    { findByFeatureId: vi.fn(async () => options.timings ?? [{ phase: 'implement' }]) } as never
  );
  return { useCase, harnesses, runs, workspace, improver, offer };
}

describe('ReflectOnFeatureRunUseCase', () => {
  it('does nothing while the flag is off or the mode is Off', async () => {
    for (const opts of [{ selfLearning: false }, { mode: LearningMode.Off }]) {
      const { useCase, improver, runs } = build(opts);
      expect(await useCase.execute(INPUT, 'run-1')).toEqual({ skipped: true, costUsd: 0 });
      expect(improver.missions).toHaveLength(0);
      expect(runs.runs.size).toBe(0);
    }
  });

  it('proposes, composes and stores an untested candidate with a capped lesson', async () => {
    const { useCase, harnesses, runs, improver, offer, workspace } = build({
      scripts: {
        dom: addSkill,
        agg: addSkill,
        experience: () => ({ text: EXPERIENCE_REPLY, costUsd: 0.2 }),
      },
    });
    const result = await useCase.execute(INPUT, 'run-1');

    expect(result.status).toBe(HarnessRefinementStatus.Proposed);
    const stages = improver.missions.map((m) => m.spec.stage);
    expect(stages.filter((s) => s === HarnessImproverStage.Propose)).toHaveLength(2);
    expect(improver.missions.every((m) => m.spec.untested)).toBe(true);

    const candidate = (await harnesses.findVersion(result.candidateVersionId!))!;
    expect(candidate.status).toBe(LearnedHarnessStatus.Candidate);
    expect(candidate.origin).toBe(HarnessOrigin.Reflect);
    expect(candidate.scope).toBe(MemoryScope.Project);
    expect(candidate.components.map((c) => c.path)).toContain('skills/migrations/SKILL.md');
    expect(candidate.components.find((c) => c.path === 'instructions.md')?.content).toContain(
      '`migrations`'
    );

    expect(harnesses.edits.map((e) => e.verdict)).toEqual([HarnessEditVerdict.Untested]);
    expect(harnesses.lessons).toHaveLength(1);
    expect(harnesses.lessons[0].confidence).toBe(LessonConfidence.Low);

    const run = [...runs.runs.values()][0];
    expect(run).toMatchObject({ status: HarnessRefinementStatus.Proposed, k: 0 });
    expect(run.sessions).toBe(4);
    expect(run.costUsd).toBeCloseTo(0.1 + 0.5 + 0.5 + 0.2);
    expect(offer.execute).toHaveBeenCalledWith(
      expect.objectContaining({ featureName: 'Add audit log', agentRunId: 'run-1' })
    );
    expect([...workspace.roots.values()].every((e) => e.disposed)).toBe(true);
  });

  it('skips runs that never reached implementation', async () => {
    const { useCase, improver } = build({ timings: [{ phase: 'analyze' }, { phase: 'plan' }] });
    expect((await useCase.execute(INPUT, 'run-1')).skipped).toBe(true);
    expect(improver.missions).toHaveLength(0);
  });

  it('records KEEP_BASE without a candidate', async () => {
    const { useCase, harnesses, runs, offer } = build();
    const result = await useCase.execute(INPUT, 'run-1');
    expect(result.status).toBe(HarnessRefinementStatus.KeptBase);
    expect(harnesses.versions.size).toBe(0);
    expect([...runs.runs.values()][0].status).toBe(HarnessRefinementStatus.KeptBase);
    expect(offer.execute).not.toHaveBeenCalled();
  });

  it('builds on the adopted version and links the candidate to it', async () => {
    const { useCase, harnesses } = build({ scripts: { agg: addSkill } });
    await harnesses.createVersion({
      id: 'v0',
      scope: MemoryScope.Project,
      repositoryPath: '/repos/app',
      status: LearnedHarnessStatus.Adopted,
      origin: HarnessOrigin.Manual,
      components: [
        { kind: 'guardrails' as never, path: 'guardrails.md', content: 'Run tests.', sha256: 'h' },
      ],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
    const result = await useCase.execute(INPUT, 'run-1');
    const candidate = (await harnesses.findVersion(result.candidateVersionId!))!;
    expect(candidate.parentVersionId).toBe('v0');
    expect(candidate.components.find((c) => c.path === 'guardrails.md')?.content).toBe(
      'Run tests.'
    );
  });

  it('records a failure and never throws when the improver keeps failing', async () => {
    const failing: ImproverScript = () => ({ fail: 'agent unavailable' });
    const { useCase, runs } = build({ scripts: { inv: failing, dom: failing, agg: failing } });
    const result = await useCase.execute(INPUT, 'run-1');
    expect(result.status).toBe(HarnessRefinementStatus.FellBack);
    expect([...runs.runs.values()][0].error).toContain('agent unavailable');
  });

  it('marks the run failed when evidence cannot be built', async () => {
    const { useCase, runs } = build();
    (
      useCase as unknown as { evidence: { execute: ReturnType<typeof vi.fn> } }
    ).evidence.execute.mockRejectedValueOnce(new Error('db locked'));
    const result = await useCase.execute(INPUT, 'run-1');
    expect(result.status).toBe(HarnessRefinementStatus.Failed);
    expect([...runs.runs.values()][0].error).toBe('db locked');
  });
});
