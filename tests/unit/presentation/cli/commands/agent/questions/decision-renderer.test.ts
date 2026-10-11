/**
 * CLI decision renderer (spec 134) — the same Decision the web panel shows,
 * as text and as an interactive prompt with the recommendation as default.
 */

import { describe, it, expect, vi } from 'vitest';
import { DecisionKind, DecisionResponseMode, type Decision } from '@/domain/generated/output.js';
import { buildApprovalGateDecision } from '@/domain/shared/decision-builders.js';
import {
  CUSTOM_ANSWER_CHOICE,
  promptDecision,
  renderDecisionLines,
  type DecisionPrompts,
} from '../../../../../../../src/presentation/cli/commands/agent/questions/decision-renderer.js';

const decision: Decision = {
  id: 'd1',
  kind: DecisionKind.AgentAsk,
  responseMode: DecisionResponseMode.Async,
  title: 'fast-implement is blocked',
  questions: [
    {
      id: 'q1',
      header: 'Store',
      question: 'Which store?',
      multiSelect: false,
      allowCustom: true,
      options: [
        { id: 'redis', label: 'Redis', description: 'Shared', recommended: true },
        { id: 'memory', label: 'Memory', description: 'Per process' },
      ],
    },
    {
      id: 'q2',
      header: 'Platforms',
      question: 'Which platforms?',
      multiSelect: true,
      allowCustom: false,
      options: [
        { id: 'web', label: 'Web', description: '' },
        { id: 'ios', label: 'iOS', description: '' },
      ],
    },
  ],
};

function prompts(overrides: Partial<DecisionPrompts> = {}): DecisionPrompts {
  return {
    select: vi.fn().mockResolvedValue('memory'),
    checkbox: vi.fn().mockResolvedValue(['web', 'ios']),
    input: vi.fn().mockResolvedValue('Postgres'),
    ...overrides,
  };
}

describe('renderDecisionLines', () => {
  it('prints the title, each question with n/N, numbered options and the recommendation', () => {
    const text = renderDecisionLines(decision).join('\n');
    expect(text).toContain('fast-implement is blocked');
    expect(text).toContain('[1/2] Store — Which store?');
    expect(text).toContain('1. Redis (recommended) — Shared');
    expect(text).toContain('2. Memory — Per process');
    expect(text).toContain('[2/2] Platforms — Which platforms? (select one or more)');
  });

  it('prints an approval gate as a sentence, never JSON', () => {
    const text = renderDecisionLines(buildApprovalGateDecision('g', 'merge')).join('\n');
    expect(text).toContain('The pull request is ready to merge');
    expect(text).not.toContain('{');
  });
});

describe('promptDecision', () => {
  it('asks each question with the recommended option as the default', async () => {
    const p = prompts();
    const responses = await promptDecision(decision, p);
    expect(p.select).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Which store?', default: 'redis' })
    );
    expect(responses).toEqual([
      { questionId: 'q1', optionIds: ['memory'] },
      { questionId: 'q2', optionIds: ['web', 'ios'] },
    ]);
  });

  it('offers a typed answer where the question allows it', async () => {
    const p = prompts({ select: vi.fn().mockResolvedValue(CUSTOM_ANSWER_CHOICE) });
    const responses = await promptDecision(decision, p);
    expect(responses[0]).toEqual({ questionId: 'q1', optionIds: [], customText: 'Postgres' });
  });
});
