import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SelectProbeOutputUseCase } from '@/application/use-cases/harness-learning/select-probe-output.use-case.js';
import type { ProbedRollout } from '@/application/use-cases/harness-learning/explore.types.js';
import {
  InMemoryEvidenceWorkspace,
  ScriptedImprover,
  type ImproverScript,
} from '../../../../helpers/harness-learning.fakes.js';

function rollout(
  label: string,
  opts: { delivered?: boolean; passed?: boolean } = {}
): ProbedRollout {
  const delivered = opts.delivered ?? true;
  return {
    label,
    tree: { 'guardrails.md': `harness of ${label}` },
    result: { text: 'done', costUsd: 1 },
    outcome: {
      label,
      diff: delivered ? `+ change ${label.length}${label.slice(-1)}` : '',
      diffStat: delivered ? '1 file changed' : '',
      delivered,
      checks: [
        {
          command: 'pnpm test',
          passed: opts.passed ?? true,
          exitCode: opts.passed === false ? 1 : 0,
          timedOut: false,
          output: '',
        },
      ],
    },
  };
}

function run(finals: ProbedRollout[], script?: ImproverScript) {
  const ws = new InMemoryEvidenceWorkspace();
  const improver = new ScriptedImprover(ws, script ? { select: script } : {});
  const useCase = new SelectProbeOutputUseCase(improver, ws);
  return {
    ws,
    improver,
    result: useCase.execute({
      finals,
      task: 'add an audit log',
      seedKey: 'feat-1|3|parallel',
      alwaysOnCharCap: 4000,
      featureId: 'feat-1',
    }),
  };
}

describe('SelectProbeOutputUseCase', () => {
  it('needs no selector for a single delivered final', async () => {
    const { improver, result } = run([rollout('agg1'), rollout('agg2', { delivered: false })]);
    const r = await result;
    expect(r.chosen?.label).toBe('agg1');
    expect(improver.missions).toHaveLength(0);
  });

  it('shows the selector only anonymous diffs and checks, never the harness', async () => {
    let seen: Record<string, string> = {};
    const { result, improver } = run(
      [rollout('agg1'), rollout('agg2'), rollout('agg3')],
      (m, ws) => {
        seen = ws.files;
        return { text: '<why>B is complete</why>\n```choice\nB\n```' };
      }
    );
    const r = await result;
    expect(improver.missions[0].spec.candidateIds).toEqual(['A', 'B', 'C']);
    expect(r.chosen?.label).toBe(r.idMap.B);
    expect(r.why).toBe('B is complete');
    expect(r.fellBack).toBe(false);
    const all = JSON.stringify(seen);
    expect(all).not.toContain('harness of');
    expect(all).not.toMatch(/agg\d/);
    expect(Object.keys(seen)).toContain('candidates/A/diff.md');
  });

  it('falls back to the passing candidate when the reply is malformed', async () => {
    const { result } = run(
      [rollout('agg1', { passed: false }), rollout('agg2', { passed: true })],
      () => ({ text: 'I like the second one' })
    );
    const r = await result;
    expect(r.fellBack).toBe(true);
    expect(r.chosen?.label).toBe('agg2');
    expect(r.why).toMatch(/no ```choice block/);
  });

  it('chooses nothing when no final delivered', async () => {
    const r = await run([rollout('agg1', { delivered: false })]).result;
    expect(r.chosen).toBeUndefined();
    expect(r.fellBack).toBe(true);
  });

  it('gives the same ids for the same seed', async () => {
    const a = await run([rollout('agg1'), rollout('agg2')], () => ({ text: '```choice\nA\n```' }))
      .result;
    const b = await run([rollout('agg2'), rollout('agg1')], () => ({ text: '```choice\nA\n```' }))
      .result;
    expect(a.idMap).toEqual(b.idMap);
  });
});
