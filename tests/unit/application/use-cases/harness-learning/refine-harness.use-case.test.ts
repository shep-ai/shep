import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { RefineHarnessUseCase } from '@/application/use-cases/harness-learning/refine-harness.use-case.js';
import { SelectProbeOutputUseCase } from '@/application/use-cases/harness-learning/select-probe-output.use-case.js';
import type {
  IHarnessRolloutRunner,
  RolloutRequest,
} from '@/application/use-cases/harness-learning/explore.types.js';
import type {
  IProbeWorktreeService,
  ProbeOutcome,
  ProbeWorktree,
} from '@/application/ports/output/services/probe-worktree.interface.js';
import type { HarnessTree } from '@/domain/harness-learning/harness-tree.js';
import {
  InMemoryEvidenceWorkspace,
  InMemoryHarnessRefinementRepository,
  InMemoryLearnedHarnessRepository,
  ScriptedImprover,
  fakeSpaceContext,
  type ImproverScript,
} from '../../../../helpers/harness-learning.fakes.js';
import { createTelemetryDouble } from '../../../../helpers/telemetry.helper.js';
import {
  AgentType,
  HarnessEditVerdict,
  HarnessOrigin,
  HarnessRecursion,
  HarnessRefinementStatus,
  LearningMode,
  TelemetryEvent,
} from '@/domain/generated/output.js';

/** Probes held in memory; what a probe "delivers" is decided by the runner. */
class FakeProbes implements IProbeWorktreeService {
  readonly delivered = new Map<string, boolean>();
  readonly forked: string[] = [];
  readonly disposed: string[] = [];
  adopted?: string;
  async headCommit() {
    return 'c0';
  }
  async fork(_wt: string, baseCommit: string, label: string): Promise<ProbeWorktree> {
    this.forked.push(label);
    return { label, path: `/probe/${label}`, baseCommit };
  }
  async inspect(probe: ProbeWorktree): Promise<ProbeOutcome> {
    const delivered = this.delivered.get(probe.label) ?? false;
    return {
      label: probe.label,
      diff: delivered ? `+ change ${probe.label.length}` : '',
      diffStat: delivered ? '1 file changed' : '',
      delivered,
      checks: [
        {
          command: 'pnpm test',
          passed: delivered,
          exitCode: delivered ? 0 : 1,
          timedOut: false,
          output: '',
        },
      ],
    };
  }
  async adopt(probe: ProbeWorktree) {
    this.adopted = probe.label;
  }
  async dispose(probe: ProbeWorktree) {
    this.disposed.push(probe.label);
  }
}

const SKILL = '---\nname: migrations\ndescription: Add a column safely\n---\nSteps.';
const addSkill: ImproverScript = (_m, ws) => {
  ws.harness['skills/migrations/SKILL.md'] = SKILL;
  return {
    text: '<notes>kept -> migrations skill -> inv1 probe passed, base failed</notes>',
    costUsd: 0.25,
  };
};
const EXPERIENCE = `<edits>
component: skills/migrations/SKILL.md
candidates: inv1, agg1
change: added the skill
observed: inv1 passed its checks, base1 failed
verdict: helped
</edits>
<experience>
cue: a feature adds a NOT NULL column
lesson: add a migrations skill
evidence: row 1
confidence: medium
</experience>`;

function build(
  opts: {
    scripts?: Record<string, ImproverScript>;
    deliver?: (req: RolloutRequest) => boolean;
    rolloutCost?: number;
  } = {}
) {
  const harnesses = new InMemoryLearnedHarnessRepository();
  const runs = new InMemoryHarnessRefinementRepository();
  const workspace = new InMemoryEvidenceWorkspace();
  const improver = new ScriptedImprover(workspace, opts.scripts ?? {});
  const probes = new FakeProbes();
  const rollouts: { label: string; tree: HarnessTree }[] = [];
  const runner: IHarnessRolloutRunner = {
    rollout: vi.fn(async (req: RolloutRequest) => {
      rollouts.push({ label: req.label, tree: req.tree });
      probes.delivered.set(req.label, opts.deliver ? opts.deliver(req) : true);
      return { text: `done ${req.label}`, costUsd: opts.rolloutCost ?? 1 };
    }),
  };
  const offer = { execute: vi.fn(async () => ({ autoAdopted: false, findings: [] })) };
  const telemetry = createTelemetryDouble();
  const useCase = new RefineHarnessUseCase(
    harnesses,
    runs,
    improver,
    workspace,
    probes,
    { execute: vi.fn(async () => ({ 'task.md': 'add an audit log' })) } as never,
    new SelectProbeOutputUseCase(improver, workspace),
    offer as never,
    fakeSpaceContext(),
    telemetry
  );
  const input = (k: number, recursion = HarnessRecursion.Parallel, maxCostUsd = 1000) => ({
    featureId: 'feat-1',
    featureName: 'Audit log',
    repositoryPath: '/repos/app',
    featureWorktree: '/wt/feat-1',
    agentType: AgentType.ClaudeCode,
    agentRunId: 'run-1',
    k,
    recursion,
    maxCostUsd,
    alwaysOnCharCap: 4000,
    runner,
  });
  return {
    useCase,
    harnesses,
    runs,
    workspace,
    improver,
    probes,
    rollouts,
    offer,
    input,
    telemetry,
  };
}

describe('RefineHarnessUseCase', () => {
  it('runs 4 rollouts and 3 sessions at k=1, adopts the final and records an Explore candidate', async () => {
    const t = build({
      scripts: { inv: addSkill, agg: addSkill, experience: () => ({ text: EXPERIENCE }) },
    });
    const result = await t.useCase.execute(t.input(1));

    expect(t.rollouts.map((r) => r.label)).toEqual(['base1', 'inv1', 'dom1', 'agg1']);
    expect(result).toMatchObject({
      status: HarnessRefinementStatus.Proposed,
      adopted: true,
      chosenLabel: 'agg1',
    });
    expect(t.probes.adopted).toBe('agg1');
    expect(t.probes.disposed.sort()).toEqual([...t.probes.forked].sort());

    const run = [...t.runs.runs.values()][0];
    expect(run).toMatchObject({
      rollouts: 4,
      sessions: 3,
      k: 1,
      recursion: HarnessRecursion.Parallel,
    });
    const candidate = (await t.harnesses.findVersion(result.candidateVersionId!))!;
    expect(candidate.origin).toBe(HarnessOrigin.Explore);
    expect(t.harnesses.edits[0].verdict).toBe(HarnessEditVerdict.Helped);
    expect(t.offer.execute).toHaveBeenCalled();
    expect(t.telemetry.record).toHaveBeenCalledWith(TelemetryEvent.HarnessRefinementFinished, {
      mode: LearningMode.Explore,
      status: HarnessRefinementStatus.Proposed,
      k: 1,
      rollouts: 4,
      sessions: 3,
    });
    expect(
      t.improver.missions.find((m) => m.label.startsWith('inv'))?.spec.untested
    ).toBeUndefined();
  });

  it.each([
    [2, HarnessRecursion.Parallel],
    [3, HarnessRecursion.Parallel],
    [2, HarnessRecursion.Sequential],
    [3, HarnessRecursion.Sequential],
  ])('keeps the 4k / 3k budget at k=%i (%s)', async (k, recursion) => {
    const t = build({
      scripts: {
        inv: addSkill,
        agg: addSkill,
        c: addSkill,
        select: () => ({ text: '```choice\nA\n```' }),
      },
    });
    await t.useCase.execute(t.input(k, recursion));
    const run = [...t.runs.runs.values()][0];
    expect(run.rollouts).toBe(4 * k);
    expect(run.sessions).toBe(3 * k);
  });

  it('edits the previous checkpoint in each sequential round', async () => {
    const t = build({
      scripts: {
        c: (m, ws) => {
          ws.harness[`skills/round-${m.spec.index}/SKILL.md`] =
            `---\nname: round-${m.spec.index}\ndescription: d\n---\nx`;
        },
        select: () => ({ text: '```choice\nA\n```' }),
      },
    });
    await t.useCase.execute(t.input(2, HarnessRecursion.Sequential));
    const inv2 = t.improver.missions.find((m) => m.label.startsWith('inv2'))!;
    const harnessSeen = Object.keys(t.workspace.entry(inv2.workspaceRoot).harness);
    expect(harnessSeen).toContain('skills/round-1/SKILL.md');
    expect(t.improver.missions.find((m) => m.label.startsWith('c2'))?.spec.sequential).toBe(true);
  });

  it('stops at the cost cap and keeps the best base attempt', async () => {
    const t = build({ rolloutCost: 50, scripts: { inv: addSkill } });
    const result = await t.useCase.execute(t.input(2, HarnessRecursion.Parallel, 60));
    expect(result.status).toBe(HarnessRefinementStatus.OverBudget);
    expect(result.adopted).toBe(true);
    expect(t.probes.adopted).toMatch(/^base/);
    expect(t.improver.missions).toHaveLength(0);
    expect(t.probes.disposed).toHaveLength(t.probes.forked.length);
  });

  it('keeps the base harness when nothing argued for a change', async () => {
    const t = build();
    const result = await t.useCase.execute(t.input(1));
    expect(result).toMatchObject({ status: HarnessRefinementStatus.KeptBase, adopted: true });
    expect(t.harnesses.versions.size).toBe(0);
  });

  it('fails without adopting anything when no attempt delivered', async () => {
    const t = build({ deliver: () => false, scripts: { agg: addSkill } });
    const result = await t.useCase.execute(t.input(1));
    expect(result).toMatchObject({ status: HarnessRefinementStatus.Failed, adopted: false });
    expect(t.probes.adopted).toBeUndefined();
  });

  it('records a failure and disposes probes when a rollout cannot even start', async () => {
    const t = build();
    const fork = vi.spyOn(t.probes, 'fork');
    fork.mockResolvedValueOnce({ label: 'base1', path: '/probe/base1', baseCommit: 'c0' });
    fork.mockRejectedValueOnce(new Error('worktree add failed'));
    const result = await t.useCase.execute(t.input(2));
    expect(result.status).toBe(HarnessRefinementStatus.Failed);
    expect([...t.runs.runs.values()][0].error).toBe('worktree add failed');
  });
});
