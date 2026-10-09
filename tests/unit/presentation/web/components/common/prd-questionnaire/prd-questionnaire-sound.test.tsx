import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrdQuestionnaire } from '@/components/common/prd-questionnaire';
import type { PrdQuestionnaireProps } from '@/components/common/prd-questionnaire';

/* ------------------------------------------------------------------ */
/*  Mock useSoundAction                                                */
/* ------------------------------------------------------------------ */

const mockSelectPlay = vi.fn();
const mockNavigatePlay = vi.fn();

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn((action: string) => {
    if (action === 'select') return { play: mockSelectPlay, stop: vi.fn(), isPlaying: false };
    if (action === 'navigate') return { play: mockNavigatePlay, stop: vi.fn(), isPlaying: false };
    return { play: vi.fn(), stop: vi.fn(), isPlaying: false };
  }),
}));

const defaultProps: PrdQuestionnaireProps = {
  data: {
    question: 'Review Requirements',
    context: 'Please review.',
    questions: [
      {
        id: 'q-1',
        question: 'What problem does this solve?',
        type: 'select',
        options: [
          { id: 'opt-a', label: 'Pain Point', rationale: 'User pain', recommended: true },
          { id: 'opt-b', label: 'Feature Gap', rationale: 'Missing feature' },
        ],
      },
      {
        id: 'q-2',
        question: 'What is the priority?',
        type: 'select',
        options: [
          { id: 'p0', label: 'P0', rationale: 'Critical' },
          { id: 'p1', label: 'P1', rationale: 'High', recommended: true },
        ],
      },
    ],
    finalAction: { id: 'approve', label: 'Approve', description: 'Approve' },
  },
  selections: {},
  onSelect: vi.fn(),
  onApprove: vi.fn(),
};

describe('PrdQuestionnaire — sound effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays select sound when option is clicked', () => {
    render(<PrdQuestionnaire {...defaultProps} />);

    const button = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes('Pain Point'));
    fireEvent.click(button!);

    expect(mockSelectPlay).toHaveBeenCalledOnce();
  });

  it('plays navigate sound when Previous button is clicked', () => {
    render(<PrdQuestionnaire {...defaultProps} />);
    fireEvent.click(screen.getByTestId('decision-panel-next'));

    vi.clearAllMocks();

    fireEvent.click(screen.getByRole('button', { name: /previous/i }));

    expect(mockNavigatePlay).toHaveBeenCalledOnce();
  });

  it('plays navigate sound when Next is clicked', () => {
    render(<PrdQuestionnaire {...defaultProps} />);

    fireEvent.click(screen.getByTestId('decision-panel-next'));

    expect(mockNavigatePlay).toHaveBeenCalledOnce();
  });
});
