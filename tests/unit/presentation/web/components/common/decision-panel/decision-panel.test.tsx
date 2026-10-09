/**
 * DecisionPanel (spec 134) — T3 Code's inline-options interaction model over
 * Shep's Decision.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import {
  DecisionKind,
  DecisionResponseMode,
  type Decision,
} from '@shepai/core/domain/generated/output';
import {
  DecisionPanel,
  DECISION_AUTO_ADVANCE_MS,
  type DecisionComposer,
} from '@/components/common/decision-panel';

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'd1',
    kind: DecisionKind.ChatQuestion,
    responseMode: DecisionResponseMode.Live,
    questions: [
      {
        id: 'q1',
        header: 'Store',
        question: 'Which store should cache sessions?',
        multiSelect: false,
        allowCustom: true,
        options: [
          { id: 'redis', label: 'Redis', description: 'Shared across processes' },
          {
            id: 'memory',
            label: 'In-memory',
            description: 'Fastest',
            preview: 'const cache = new Map();',
          },
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
    ...overrides,
  };
}

function singleQuestion(): Decision {
  const d = makeDecision();
  return { ...d, questions: [d.questions[0]] };
}

describe('DecisionPanel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the active question, its options with 1–9 hints, and n/N progress', () => {
    render(<DecisionPanel decision={makeDecision()} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('decision-panel')).toBeInTheDocument();
    expect(screen.getByText('Which store should cache sessions?')).toBeInTheDocument();
    expect(screen.getByText('Shared across processes')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-redis-key')).toHaveTextContent('1');
    expect(screen.getByTestId('decision-panel-progress')).toHaveTextContent('1/2');
  });

  it('a click shows the check at once and advances after 200 ms', () => {
    render(<DecisionPanel decision={makeDecision()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    expect(screen.getByTestId('decision-option-redis-check')).toBeInTheDocument();
    expect(screen.getByText('Which store should cache sessions?')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS - 1));
    expect(screen.getByText('Which store should cache sessions?')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Which platforms?')).toBeInTheDocument();
  });

  it('number keys select options; multi-select toggles without advancing', () => {
    const onSubmit = vi.fn();
    render(<DecisionPanel decision={makeDecision()} onSubmit={onSubmit} />);
    fireEvent.keyDown(document, { key: '2' });
    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
    expect(screen.getByText('Which platforms?')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '2' });
    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
    expect(screen.getByTestId('decision-option-web-check')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-ios-check')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('decision-panel-submit'));
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', optionIds: ['memory'] },
      { questionId: 'q2', optionIds: ['web', 'ios'] },
    ]);
  });

  it('ignores number keys typed into a text field', () => {
    render(<DecisionPanel decision={singleQuestion()} onSubmit={vi.fn()} />);
    const input = screen.getByTestId('decision-panel-other-input');
    fireEvent.keyDown(input, { key: '1' });
    expect(screen.queryByTestId('decision-option-redis-check')).not.toBeInTheDocument();
  });

  it('auto-advancing past the last question submits', () => {
    const onSubmit = vi.fn();
    render(<DecisionPanel decision={singleQuestion()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('decision-option-memory'));
    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'q1', optionIds: ['memory'] }]);
  });

  it('typed text outranks the selection and is submitted as the answer', () => {
    const onSubmit = vi.fn();
    render(<DecisionPanel decision={singleQuestion()} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    fireEvent.change(screen.getByTestId('decision-panel-other-input'), {
      target: { value: 'SQLite' },
    });
    expect(screen.queryByTestId('decision-option-redis-check')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('decision-panel-submit'));
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', optionIds: [], customText: 'SQLite' },
    ]);
  });

  it('clicking an option keeps displaced typed text restorable', () => {
    render(<DecisionPanel decision={singleQuestion()} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByTestId('decision-panel-other-input'), {
      target: { value: 'SQLite' },
    });
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    expect(screen.getByTestId('decision-panel-other-input')).toHaveValue('');
    fireEvent.click(screen.getByTestId('decision-panel-restore-text'));
    expect(screen.getByTestId('decision-panel-other-input')).toHaveValue('SQLite');
  });

  it('uses the host composer as "Other" and hands displaced text back to it', () => {
    const stash = vi.fn();
    function Host() {
      const [text, setText] = useState('');
      const composer: DecisionComposer = { text, setText, stash };
      return (
        <>
          <input
            data-testid="host-composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <DecisionPanel decision={singleQuestion()} onSubmit={vi.fn()} composer={composer} />
        </>
      );
    }
    render(<Host />);
    expect(screen.queryByTestId('decision-panel-other-input')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('host-composer'), { target: { value: 'Postgres' } });
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    expect(stash).toHaveBeenCalledWith('Postgres');
    expect(screen.getByTestId('host-composer')).toHaveValue('');
  });

  it('preselects the recommended option and marks it', () => {
    const d = singleQuestion();
    d.questions[0].options[0].recommended = true;
    render(<DecisionPanel decision={d} onSubmit={vi.fn()} />);
    expect(screen.getByTestId('decision-option-redis-check')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-redis-recommended')).toBeInTheDocument();
  });

  it('shows the preview of the selected option', () => {
    render(<DecisionPanel decision={singleQuestion()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('decision-option-memory'));
    expect(screen.getByTestId('decision-panel-preview')).toHaveTextContent(
      'const cache = new Map();'
    );
  });

  it('pages with Previous / Next', () => {
    render(<DecisionPanel decision={makeDecision()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    fireEvent.click(screen.getByTestId('decision-panel-next'));
    expect(screen.getByText('Which platforms?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('decision-panel-previous'));
    expect(screen.getByText('Which store should cache sessions?')).toBeInTheDocument();
    // Manual navigation cancels the pending auto-advance.
    act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
    expect(screen.getByText('Which store should cache sessions?')).toBeInTheDocument();
  });

  it('collapses to an answered row once responses exist', () => {
    render(
      <DecisionPanel
        decision={singleQuestion()}
        responses={[{ questionId: 'q1', optionIds: ['memory'] }]}
      />
    );
    expect(screen.queryByTestId('decision-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('answered-decision-row')).toHaveTextContent('Answered questions');
    expect(screen.getByTestId('answered-decision-row')).toHaveTextContent('In-memory');
  });

  it('a not-resumable decision says so and cannot be answered', () => {
    const onSubmit = vi.fn();
    render(
      <DecisionPanel
        decision={{ ...singleQuestion(), responseMode: DecisionResponseMode.NotResumable }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByTestId('decision-panel-not-resumable')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-redis')).toBeDisabled();
    fireEvent.keyDown(document, { key: '1' });
    expect(screen.queryByTestId('decision-panel-submit')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels a pending auto-advance on unmount', () => {
    const { unmount } = render(<DecisionPanel decision={singleQuestion()} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByTestId('decision-option-redis'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe('selection mode (no onSubmit) — used by the PRD questionnaire', () => {
    it('reports every selection, starts from the given selections, and never submits', () => {
      const onSelect = vi.fn();
      render(
        <DecisionPanel
          decision={makeDecision()}
          onSelect={onSelect}
          initialSelections={{ q1: ['memory'] }}
        />
      );
      expect(screen.getByTestId('decision-option-memory-check')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('decision-option-redis'));
      expect(onSelect).toHaveBeenCalledWith('q1', ['redis']);
      act(() => vi.advanceTimersByTime(DECISION_AUTO_ADVANCE_MS));
      expect(screen.getByText('Which platforms?')).toBeInTheDocument();
      expect(screen.queryByTestId('decision-panel-submit')).not.toBeInTheDocument();
    });

    it('lets the user skip a question and reports navigation', () => {
      const onNavigate = vi.fn();
      render(
        <DecisionPanel decision={makeDecision()} onSelect={vi.fn()} onNavigate={onNavigate} />
      );
      fireEvent.click(screen.getByTestId('decision-panel-next'));
      expect(screen.getByText('Which platforms?')).toBeInTheDocument();
      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('marks a newly added option', () => {
      const d = singleQuestion();
      d.questions[0].options[1].isNew = true;
      render(<DecisionPanel decision={d} onSelect={vi.fn()} />);
      expect(screen.getByTestId('decision-option-memory-new')).toBeInTheDocument();
    });
  });
});
