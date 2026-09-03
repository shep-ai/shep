import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  ActivityTab,
  buildLifecycleTimeline,
} from '@/components/common/feature-drawer-tabs/activity-tab';
import type {
  PhaseTimingData,
  RejectionFeedbackData,
} from '@/app/actions/get-feature-phase-timings';

const run1Id = 'run-001';

const singleRunTimings: PhaseTimingData[] = [
  {
    agentRunId: run1Id,
    phase: 'run:started',
    startedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    agentRunId: run1Id,
    phase: 'analyze',
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:00:05.000Z',
    durationMs: 5000,
  },
  {
    agentRunId: run1Id,
    phase: 'requirements',
    startedAt: '2024-01-01T00:00:05.000Z',
    completedAt: '2024-01-01T00:00:15.000Z',
    durationMs: 10000,
    waitingApprovalAt: '2024-01-01T00:00:12.000Z',
    approvalWaitMs: 3000,
  },
  {
    agentRunId: run1Id,
    phase: 'run:completed',
    startedAt: '2024-01-01T00:00:15.000Z',
  },
];

function renderActivityTab(
  props: Partial<{
    timings: PhaseTimingData[] | null;
    loading: boolean;
    error: string | null;
    rejectionFeedback: RejectionFeedbackData[];
  }> = {}
) {
  const defaultProps = {
    timings: null as PhaseTimingData[] | null,
    loading: false,
    error: null as string | null,
    rejectionFeedback: undefined as RejectionFeedbackData[] | undefined,
    ...props,
  };
  return render(<ActivityTab {...defaultProps} />);
}

describe('ActivityTab', () => {
  describe('loading state', () => {
    it('renders loading spinner when loading=true', () => {
      renderActivityTab({ loading: true });
      expect(screen.getByTestId('activity-tab-loading')).toBeInTheDocument();
    });

    it('does not render timings when loading', () => {
      renderActivityTab({ loading: true, timings: singleRunTimings });
      expect(screen.queryByTestId('activity-timings')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders empty state when timings array is empty', () => {
      renderActivityTab({ timings: [] });
      expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
    });

    it('renders empty state when timings is null and not loading', () => {
      renderActivityTab({ timings: null });
      expect(screen.getByText('No activity recorded yet')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error message when error is provided', () => {
      renderActivityTab({ error: 'Failed to load phase timings' });
      expect(screen.getByText('Failed to load phase timings')).toBeInTheDocument();
    });

    it('does not render timings when error is present', () => {
      renderActivityTab({ error: 'Some error', timings: singleRunTimings });
      expect(screen.queryByTestId('activity-timings')).not.toBeInTheDocument();
    });
  });

  describe('phase timing rendering', () => {
    it('renders phase name and duration for each node timing', () => {
      renderActivityTab({ timings: singleRunTimings });
      expect(screen.getByText('Analyzing')).toBeInTheDocument();
      expect(screen.getByText('Requirements')).toBeInTheDocument();
    });

    it('renders duration text next to each completed timing', () => {
      renderActivityTab({ timings: singleRunTimings });
      expect(screen.getByText('5s')).toBeInTheDocument();
      expect(screen.getByText('10s')).toBeInTheDocument();
    });

    it('renders a duration bar for each node timing', () => {
      renderActivityTab({ timings: singleRunTimings });
      const timingsContainer = screen.getByTestId('activity-timings');
      const bars = within(timingsContainer).getAllByTestId(/^timing-bar-/);
      // 2 node timings (analyze, requirements) — lifecycle events are not bars
      expect(bars.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('iteration grouping', () => {
    it('does not show iteration headers for single-iteration timings', () => {
      renderActivityTab({ timings: singleRunTimings });
      expect(screen.queryByText(/Iteration/)).not.toBeInTheDocument();
    });

    it('shows iteration headers when there are rejection cycles', () => {
      const timings: PhaseTimingData[] = [
        { agentRunId: run1Id, phase: 'run:started', startedAt: '2024-01-01T00:00:00.000Z' },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:05.000Z' },
        { agentRunId: run1Id, phase: 'run:resumed', startedAt: '2024-01-01T00:00:10.000Z' },
        {
          agentRunId: run1Id,
          phase: 'implement',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        { agentRunId: run1Id, phase: 'run:completed', startedAt: '2024-01-01T00:00:20.000Z' },
      ];
      renderActivityTab({
        timings,
        rejectionFeedback: [{ iteration: 1, message: 'fix it', phase: 'plan' }],
      });
      expect(screen.getByText('Iteration 1')).toBeInTheDocument();
      expect(screen.getByText('Iteration 2')).toBeInTheDocument();
    });
  });

  describe('approval wait sub-row', () => {
    it('renders approval wait sub-row when approvalWaitMs > 0', () => {
      renderActivityTab({ timings: singleRunTimings });
      // Requirements has approvalWaitMs: 3000
      const waitRow = screen.getByTestId('approval-wait-requirements');
      expect(waitRow).toBeInTheDocument();
      expect(within(waitRow).getByText('3s')).toBeInTheDocument();
    });

    it('does not render approval wait for phases without approvalWaitMs', () => {
      renderActivityTab({ timings: singleRunTimings });
      // Analyze has no approvalWaitMs
      expect(screen.queryByTestId('approval-wait-analyze')).not.toBeInTheDocument();
    });
  });

  describe('summary totals', () => {
    it('renders total execution time', () => {
      renderActivityTab({ timings: singleRunTimings });
      const summary = screen.getByTestId('activity-summary');
      expect(within(summary).getByText('Execution')).toBeInTheDocument();
      // 5000 + 10000 = 15000ms = 15s
      expect(within(summary).getByText('15s')).toBeInTheDocument();
    });

    it('renders total wait time when approval waits exist', () => {
      renderActivityTab({ timings: singleRunTimings });
      const summary = screen.getByTestId('activity-summary');
      expect(within(summary).getByText('Wait')).toBeInTheDocument();
    });

    it('renders total wall-clock time when waits exist', () => {
      renderActivityTab({ timings: singleRunTimings });
      const summary = screen.getByTestId('activity-summary');
      expect(within(summary).getByText('Wall-clock')).toBeInTheDocument();
      // 15000 + 3000 = 18000ms = 18s
      expect(within(summary).getByText('18s')).toBeInTheDocument();
    });

    it('does not render summary when there are no node timings', () => {
      const lifecycleOnly: PhaseTimingData[] = [
        { agentRunId: run1Id, phase: 'run:started', startedAt: '2024-01-01T00:00:00.000Z' },
      ];
      renderActivityTab({ timings: lifecycleOnly });
      expect(screen.queryByTestId('activity-summary')).not.toBeInTheDocument();
    });
  });

  describe('lifecycle events', () => {
    it('renders lifecycle event markers', () => {
      renderActivityTab({ timings: singleRunTimings });
      // run:started and run:completed lifecycle events
      expect(screen.getByText('started')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
    });

    it('renders rejected lifecycle event', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'requirements',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:00:10.000Z',
          durationMs: 10000,
          waitingApprovalAt: '2024-01-01T00:00:08.000Z',
          approvalWaitMs: 5000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:15.000Z',
        },
      ];
      renderActivityTab({ timings: timingsWithRejection });
      expect(screen.getByText('rejected')).toBeInTheDocument();
    });

    it('displays rejection feedback text when provided', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'requirements',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:00:10.000Z',
          durationMs: 10000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:15.000Z',
        },
      ];
      renderActivityTab({
        timings: timingsWithRejection,
        rejectionFeedback: [
          { iteration: 1, message: 'Please add more tests', phase: 'requirements' },
        ],
      });
      expect(screen.getByText('rejected')).toBeInTheDocument();
      expect(screen.getByTestId('rejection-feedback-text')).toBeInTheDocument();
      expect(screen.getByText(/Please add more tests/)).toBeInTheDocument();
    });

    it('displays rejection feedback attachments when provided', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'requirements',
          startedAt: '2024-01-01T00:00:00.000Z',
          completedAt: '2024-01-01T00:00:10.000Z',
          durationMs: 10000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:15.000Z',
        },
      ];
      renderActivityTab({
        timings: timingsWithRejection,
        rejectionFeedback: [
          {
            iteration: 1,
            message: 'Fix the layout',
            phase: 'requirements',
            attachments: ['/home/user/.shep/attachments/pending-abc/screenshot.png'],
          },
        ],
      });
      expect(screen.getByTestId('rejection-feedback-attachments')).toBeInTheDocument();
      expect(screen.getByTestId('inline-attachment-image')).toBeInTheDocument();
    });

    it('does not display rejection text when no feedback provided', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:15.000Z',
        },
      ];
      renderActivityTab({ timings: timingsWithRejection });
      expect(screen.getByText('rejected')).toBeInTheDocument();
      expect(screen.queryByTestId('rejection-feedback-text')).not.toBeInTheDocument();
    });

    it('displays all rejection feedback entries even when more feedback than run:rejected events', () => {
      // Simulate the real-world scenario: 4 rejection feedback entries
      // but only 2 run:rejected timing events
      const timingsWithTwoRejections: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:05.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'run:resumed',
          startedAt: '2024-01-01T00:00:10.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'merge',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:20.000Z',
        },
      ];

      const feedback: RejectionFeedbackData[] = [
        { iteration: 1, message: 'rebase on main', phase: 'plan' },
        { iteration: 2, message: 'rebase on main', phase: 'merge' },
        {
          iteration: 3,
          message: 'add support for evidence agent into fast mode as well',
          phase: 'merge',
        },
        {
          iteration: 4,
          message:
            "I've test and created a feature but the screenshots seems to be broken https://github.com/shep-ai/shep/pull/258 fix",
          phase: 'merge',
        },
      ];

      renderActivityTab({
        timings: timingsWithTwoRejections,
        rejectionFeedback: feedback,
      });

      // All 4 rejection feedback texts must be visible
      const feedbackElements = screen.getAllByTestId('rejection-feedback-text');
      expect(feedbackElements).toHaveLength(4);

      // Verify specific messages
      expect(
        screen.getByText(/add support for evidence agent into fast mode as well/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/I've test and created a feature but the screenshots seems to be broken/)
      ).toBeInTheDocument();
    });

    it('shows duplicate rejection messages as separate events', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:05.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'run:resumed',
          startedAt: '2024-01-01T00:00:10.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'merge',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:20.000Z',
        },
      ];

      // Two identical messages from different iterations
      const feedback: RejectionFeedbackData[] = [
        { iteration: 1, message: 'rebase on main', phase: 'plan' },
        { iteration: 2, message: 'rebase on main', phase: 'merge' },
      ];

      renderActivityTab({
        timings: timingsWithRejection,
        rejectionFeedback: feedback,
      });

      // Both "rebase on main" must appear as separate rejection events
      const feedbackElements = screen.getAllByTestId('rejection-feedback-text');
      expect(feedbackElements).toHaveLength(2);
      // Both should contain the same message text
      for (const el of feedbackElements) {
        expect(el.textContent).toContain('rebase on main');
      }
    });

    it('renders long rejection messages without data loss', () => {
      const timingsWithRejection: PhaseTimingData[] = [
        {
          agentRunId: run1Id,
          phase: 'run:started',
          startedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          agentRunId: run1Id,
          phase: 'run:rejected',
          startedAt: '2024-01-01T00:00:05.000Z',
        },
      ];

      const longMessage =
        "I've test and created a feature but the screenshots seems to be broken https://github.com/shep-ai/shep/pull/258 fix";
      renderActivityTab({
        timings: timingsWithRejection,
        rejectionFeedback: [{ iteration: 1, message: longMessage, phase: 'merge' }],
      });

      expect(screen.getByTestId('rejection-feedback-text')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(longMessage.slice(0, 40)))).toBeInTheDocument();
    });
  });

  describe('lifecycle iteration rendering', () => {
    it('renders each rejection cycle as a separate iteration', () => {
      const timings: PhaseTimingData[] = [
        { agentRunId: run1Id, phase: 'run:started', startedAt: '2024-01-01T00:00:00.000Z' },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:05.000Z' },
        { agentRunId: run1Id, phase: 'run:resumed', startedAt: '2024-01-01T00:00:10.000Z' },
        {
          agentRunId: run1Id,
          phase: 'implement',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:20.000Z' },
        { agentRunId: run1Id, phase: 'run:resumed', startedAt: '2024-01-01T00:00:25.000Z' },
        {
          agentRunId: run1Id,
          phase: 'merge',
          startedAt: '2024-01-01T00:00:25.000Z',
          completedAt: '2024-01-01T00:00:30.000Z',
          durationMs: 5000,
        },
        { agentRunId: run1Id, phase: 'run:completed', startedAt: '2024-01-01T00:00:30.000Z' },
      ];

      const feedback: RejectionFeedbackData[] = [
        { iteration: 1, message: 'rebase on main', phase: 'plan' },
        { iteration: 2, message: 'fix tests', phase: 'implement' },
      ];

      renderActivityTab({ timings, rejectionFeedback: feedback });

      // Should show 3 iterations: rejected, rejected, completed
      expect(screen.getByText('Iteration 1')).toBeInTheDocument();
      expect(screen.getByText('Iteration 2')).toBeInTheDocument();
      expect(screen.getByText('Iteration 3')).toBeInTheDocument();

      // Rejection messages should be in their respective iterations
      expect(screen.getByText(/rebase on main/)).toBeInTheDocument();
      expect(screen.getByText(/fix tests/)).toBeInTheDocument();

      // Final iteration should show completed
      const iter3 = screen.getByTestId('iteration-3');
      expect(within(iter3).getByText('completed')).toBeInTheDocument();
    });

    it('shows resumed events at the start of subsequent iterations', () => {
      const timings: PhaseTimingData[] = [
        { agentRunId: run1Id, phase: 'run:started', startedAt: '2024-01-01T00:00:00.000Z' },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:05.000Z' },
        { agentRunId: run1Id, phase: 'run:resumed', startedAt: '2024-01-01T00:00:10.000Z' },
        {
          agentRunId: run1Id,
          phase: 'implement',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        { agentRunId: run1Id, phase: 'run:completed', startedAt: '2024-01-01T00:00:20.000Z' },
      ];

      renderActivityTab({
        timings,
        rejectionFeedback: [{ iteration: 1, message: 'fix it', phase: 'plan' }],
      });

      // Iteration 2 should contain the "resumed" event
      const iter2 = screen.getByTestId('iteration-2');
      expect(within(iter2).getByText('resumed')).toBeInTheDocument();
    });

    it('creates synthetic iterations for unmatched feedback entries', () => {
      // 2 run:rejected events but 4 feedback entries
      const timings: PhaseTimingData[] = [
        { agentRunId: run1Id, phase: 'run:started', startedAt: '2024-01-01T00:00:00.000Z' },
        {
          agentRunId: run1Id,
          phase: 'plan',
          startedAt: '2024-01-01T00:00:01.000Z',
          completedAt: '2024-01-01T00:00:05.000Z',
          durationMs: 4000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:05.000Z' },
        { agentRunId: run1Id, phase: 'run:resumed', startedAt: '2024-01-01T00:00:10.000Z' },
        {
          agentRunId: run1Id,
          phase: 'merge',
          startedAt: '2024-01-01T00:00:10.000Z',
          completedAt: '2024-01-01T00:00:20.000Z',
          durationMs: 10000,
        },
        { agentRunId: run1Id, phase: 'run:rejected', startedAt: '2024-01-01T00:00:20.000Z' },
      ];

      const feedback: RejectionFeedbackData[] = [
        { iteration: 1, message: 'rebase on main', phase: 'plan' },
        { iteration: 2, message: 'rebase on main', phase: 'merge' },
        { iteration: 3, message: 'add evidence agent support', phase: 'merge' },
        { iteration: 4, message: 'screenshots broken', phase: 'merge' },
      ];

      renderActivityTab({ timings, rejectionFeedback: feedback });

      // Should produce 4 iterations (2 real + 2 synthetic)
      expect(screen.getByTestId('iteration-1')).toBeInTheDocument();
      expect(screen.getByTestId('iteration-2')).toBeInTheDocument();
      expect(screen.getByTestId('iteration-3')).toBeInTheDocument();
      expect(screen.getByTestId('iteration-4')).toBeInTheDocument();

      // All 4 rejection messages visible
      const feedbackElements = screen.getAllByTestId('rejection-feedback-text');
      expect(feedbackElements).toHaveLength(4);
      expect(screen.getByText(/add evidence agent support/)).toBeInTheDocument();
      expect(screen.getByText(/screenshots broken/)).toBeInTheDocument();
    });
  });

  describe('color coding', () => {
    it('applies emerald color for completed phase bars', () => {
      renderActivityTab({ timings: singleRunTimings });
      const bar = screen.getByTestId('timing-bar-analyze');
      expect(bar.querySelector('.bg-emerald-500')).toBeInTheDocument();
    });

    it('applies amber color for approval wait bars', () => {
      renderActivityTab({ timings: singleRunTimings });
      const waitBar = screen.getByTestId('approval-wait-requirements');
      expect(waitBar.querySelector('.bg-amber-500')).toBeInTheDocument();
    });
  });
});

describe('buildLifecycleTimeline', () => {
  it('returns empty array for empty timings', () => {
    expect(buildLifecycleTimeline([])).toEqual([]);
  });

  it('produces a single iteration when no rejections', () => {
    const result = buildLifecycleTimeline(singleRunTimings);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
    expect(result[0].rejectionMessage).toBeUndefined();
    expect(result[0].timings).toEqual(singleRunTimings);
  });

  it('splits at run:rejected boundaries', () => {
    const timings: PhaseTimingData[] = [
      { agentRunId: 'r1', phase: 'run:started', startedAt: 't0' },
      { agentRunId: 'r1', phase: 'plan', startedAt: 't1', completedAt: 't2', durationMs: 1000 },
      { agentRunId: 'r1', phase: 'run:rejected', startedAt: 't2' },
      { agentRunId: 'r1', phase: 'run:resumed', startedAt: 't3' },
      {
        agentRunId: 'r1',
        phase: 'implement',
        startedAt: 't3',
        completedAt: 't4',
        durationMs: 2000,
      },
      { agentRunId: 'r1', phase: 'run:completed', startedAt: 't4' },
    ];
    const feedback: RejectionFeedbackData[] = [{ iteration: 1, message: 'fix it', phase: 'plan' }];

    const result = buildLifecycleTimeline(timings, feedback);

    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[0].rejectionMessage).toBe('fix it');
    expect(result[0].timings).toHaveLength(3); // started, plan, rejected
    expect(result[1].number).toBe(2);
    expect(result[1].rejectionMessage).toBeUndefined();
    expect(result[1].timings).toHaveLength(3); // resumed, implement, completed
  });

  it('synthesizes additional rejected events for unmatched feedback', () => {
    const timings: PhaseTimingData[] = [
      { agentRunId: 'r1', phase: 'run:started', startedAt: 't0' },
      { agentRunId: 'r1', phase: 'run:rejected', startedAt: 't1' },
    ];
    const feedback: RejectionFeedbackData[] = [
      { iteration: 1, message: 'first', phase: 'merge' },
      { iteration: 2, message: 'second', phase: 'merge', timestamp: 'ts2' },
      { iteration: 3, message: 'third', phase: 'merge', timestamp: 'ts3' },
    ];

    const result = buildLifecycleTimeline(timings, feedback);

    expect(result).toHaveLength(3);
    expect(result[0].rejectionMessage).toBe('first');
    expect(result[1].rejectionMessage).toBe('second');
    expect(result[2].rejectionMessage).toBe('third');
  });

  it('matches feedback by position to iterations', () => {
    const timings: PhaseTimingData[] = [
      { agentRunId: 'r1', phase: 'run:started', startedAt: 't0' },
      { agentRunId: 'r1', phase: 'run:rejected', startedAt: 't1' },
      { agentRunId: 'r1', phase: 'run:resumed', startedAt: 't2' },
      { agentRunId: 'r1', phase: 'run:rejected', startedAt: 't3' },
      { agentRunId: 'r1', phase: 'run:resumed', startedAt: 't4' },
      { agentRunId: 'r1', phase: 'run:completed', startedAt: 't5' },
    ];
    const feedback: RejectionFeedbackData[] = [
      { iteration: 1, message: 'first rejection', phase: 'plan' },
      { iteration: 2, message: 'second rejection', phase: 'merge' },
    ];

    const result = buildLifecycleTimeline(timings, feedback);

    expect(result).toHaveLength(3);
    expect(result[0].rejectionMessage).toBe('first rejection');
    expect(result[1].rejectionMessage).toBe('second rejection');
    expect(result[2].rejectionMessage).toBeUndefined();
  });
});

describe('ActivityTab — model attribution', () => {
  it('shows the model a phase ran on', () => {
    const timings: PhaseTimingData[] = [
      {
        agentRunId: 'r1',
        phase: 'implement:phase-1',
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:00:05.000Z',
        durationMs: 5000,
        modelId: 'claude-haiku-4-5',
      },
    ];

    render(<ActivityTab timings={timings} loading={false} error={null} />);

    expect(screen.getByTestId('timing-model-implement:phase-1')).toHaveTextContent(
      'claude-haiku-4-5'
    );
  });

  it('renders different models for different phases of the same run', () => {
    const timings: PhaseTimingData[] = [
      {
        agentRunId: 'r1',
        phase: 'plan',
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:00:05.000Z',
        durationMs: 5000,
        modelId: 'claude-opus-5',
      },
      {
        agentRunId: 'r1',
        phase: 'implement:phase-1',
        startedAt: '2024-01-01T00:00:05.000Z',
        completedAt: '2024-01-01T00:00:09.000Z',
        durationMs: 4000,
        modelId: 'claude-haiku-4-5',
      },
    ];

    render(<ActivityTab timings={timings} loading={false} error={null} />);

    expect(screen.getByTestId('timing-model-plan')).toHaveTextContent('claude-opus-5');
    expect(screen.getByTestId('timing-model-implement:phase-1')).toHaveTextContent(
      'claude-haiku-4-5'
    );
  });

  it('renders nothing extra for a timing with no recorded model', () => {
    const timings: PhaseTimingData[] = [
      {
        agentRunId: 'r1',
        phase: 'analyze',
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:00:05.000Z',
        durationMs: 5000,
      },
    ];

    render(<ActivityTab timings={timings} loading={false} error={null} />);

    expect(screen.queryByTestId('timing-model-analyze')).toBeNull();
  });
});
