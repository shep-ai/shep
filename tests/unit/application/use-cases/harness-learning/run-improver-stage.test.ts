import { describe, it, expect } from 'vitest';
import { runImproverStage } from '@/application/use-cases/harness-learning/run-improver-stage.js';
import {
  InMemoryEvidenceWorkspace,
  ScriptedImprover,
} from '../../../../helpers/harness-learning.fakes.js';
import { HarnessEditDimension, HarnessImproverStage } from '@/domain/generated/output.js';

const SPEC = {
  stage: HarnessImproverStage.Propose,
  dimension: HarnessEditDimension.Inv,
  k: 1,
  index: 1,
  alwaysOnCharCap: 4000,
};
const CURRENT = { 'guardrails.md': 'Run the tests.' };
const SKILL = '---\nname: db\ndescription: migrations\n---\nSteps';

function run(improver: ScriptedImprover, workspace: InMemoryEvidenceWorkspace) {
  return runImproverStage(
    { improver, workspace },
    { label: 'inv1', spec: SPEC, files: { 'task.md': 'x' }, current: CURRENT }
  );
}

describe('runImproverStage', () => {
  it('returns the edited, auto-triggered tree with its notes and cost', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    const improver = new ScriptedImprover(ws, {
      inv: (_m, entry) => {
        entry.harness['skills/db/SKILL.md'] = SKILL;
        return {
          text: '<notes>added db skill — base run hand-rolled a migration</notes>',
          costUsd: 0.4,
        };
      },
    });
    const result = await run(improver, ws);
    expect(result.fellBack).toBe(false);
    expect(result.keptBase).toBe(false);
    expect(result.tree['skills/db/SKILL.md']).toBe(SKILL);
    expect(result.tree['instructions.md']).toContain('`db`');
    expect(result.notes).toBe('added db skill — base run hand-rolled a migration');
    expect(result.costUsd).toBeCloseTo(0.4);
    expect(result.sessions).toBe(1);
    expect([...ws.roots.values()].every((e) => e.disposed)).toBe(true);
  });

  it('reports KEEP_BASE as kept base, not a failure', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    const result = await run(new ScriptedImprover(ws), ws);
    expect(result.keptBase).toBe(true);
    expect(result.fellBack).toBe(false);
    expect(result.tree).toEqual(CURRENT);
  });

  it('retries once with the validator message, then succeeds', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    const improver = new ScriptedImprover(ws, {
      inv: (mission, entry) => {
        entry.harness['guardrails.md'] = mission.retryFeedback ? 'Fixed.' : 'Use {{ x }}';
      },
    });
    const result = await run(improver, ws);
    expect(improver.missions).toHaveLength(2);
    expect(improver.missions[1].retryFeedback).toMatch(/template braces/);
    expect(result.tree['guardrails.md']).toBe('Fixed.');
    expect(result.sessions).toBe(2);
  });

  it('inherits the current harness after two invalid attempts', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    const improver = new ScriptedImprover(ws, {
      inv: (_m, entry) => {
        entry.harness['guardrails.md'] = 'x'.repeat(5000);
      },
    });
    const result = await run(improver, ws);
    expect(result.fellBack).toBe(true);
    expect(result.tree).toEqual(CURRENT);
    expect(result.error).toMatch(/cap is 4000/);
  });

  it('rejects off-surface files and an emptied harness', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    let turn = 0;
    const improver = new ScriptedImprover(ws, {
      inv: (mission, entry) => {
        turn += 1;
        if (turn === 1) ws.rejected.set(mission.workspaceRoot, ['notes.txt']);
        else {
          ws.rejected.delete(mission.workspaceRoot);
          for (const k of Object.keys(entry.harness)) delete entry.harness[k];
        }
      },
    });
    const result = await run(improver, ws);
    expect(improver.missions[1].retryFeedback).toMatch(/off the editable surface.*notes\.txt/);
    expect(result.fellBack).toBe(true);
    expect(result.error).toMatch(/came back empty/);
  });

  it('falls back when the improver itself fails, keeping its cost', async () => {
    const ws = new InMemoryEvidenceWorkspace();
    const improver = new ScriptedImprover(ws, {
      inv: () => ({ fail: 'agent crashed', costUsd: 0.2 }),
    });
    const result = await run(improver, ws);
    expect(result.fellBack).toBe(true);
    expect(result.error).toBe('agent crashed');
    expect(result.costUsd).toBeCloseTo(0.2);
  });
});
