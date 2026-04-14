import { describe, expect, it } from 'vitest';
import { isWorkflowInFlight } from '@/components/features/chat/ChatTab';

const step = (status: string): { status: string } => ({ status });

describe('isWorkflowInFlight (chat composer disable predicate)', () => {
  it('returns false when there is no plan at all', () => {
    expect(isWorkflowInFlight({ hasPlan: false, steps: [] })).toBe(false);
  });

  it('returns false when every step is done', () => {
    expect(
      isWorkflowInFlight({
        hasPlan: true,
        steps: [step('done'), step('done'), step('done')],
      })
    ).toBe(false);
  });

  it('returns true when at least one step is running', () => {
    expect(
      isWorkflowInFlight({
        hasPlan: true,
        steps: [step('done'), step('running'), step('pending')],
      })
    ).toBe(true);
  });

  it('regression — pending steps from a stale orchestrator do NOT lock the input', () => {
    // Repro: workflow ran 8 of 10 steps, the orchestrator was killed
    // (dev:web restart) before reaching the last two `commit` and
    // `report` steps. The old predicate (`hasPlan && !allDone`) would
    // see those `pending` rows and lock the chat composer forever.
    // The new predicate only blocks on `running` so the user can type
    // a new prompt the moment no agent is producing output.
    expect(
      isWorkflowInFlight({
        hasPlan: true,
        steps: [
          step('done'),
          step('done'),
          step('done'),
          step('done'),
          step('done'),
          step('done'),
          step('done'),
          step('done'),
          step('pending'), // commit — never started
          step('pending'), // report — never started
        ],
      })
    ).toBe(false);
  });

  it('treats interrupted + failed steps as terminal — composer stays enabled', () => {
    expect(
      isWorkflowInFlight({
        hasPlan: true,
        steps: [step('done'), step('interrupted'), step('failed')],
      })
    ).toBe(false);
  });

  it('blocks composer even if other steps are done, as long as one is running', () => {
    expect(
      isWorkflowInFlight({
        hasPlan: true,
        steps: [step('done'), step('done'), step('running')],
      })
    ).toBe(true);
  });
});
