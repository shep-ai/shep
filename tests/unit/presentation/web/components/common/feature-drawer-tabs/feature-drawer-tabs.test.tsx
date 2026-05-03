import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationEventType, PrStatus, CiStatus } from '@shepai/core/domain/generated/output';
import type { NotificationEvent } from '@shepai/core/domain/generated/output';
import { FeatureDrawerTabs } from '@/components/common/feature-drawer-tabs/feature-drawer-tabs';
import type { FeatureNodeData } from '@/components/common/feature-node';
import type { FeatureDrawerTabsProps } from '@/components/common/feature-drawer-tabs/feature-drawer-tabs';
import type { PhaseTimingData } from '@/app/actions/get-feature-phase-timings';
import type { PlanData } from '@/app/actions/get-feature-plan';

// Mock server actions
const mockGetPhaseTimings = vi.fn();
const mockGetPlan = vi.fn();

// Mock next/navigation
let mockPathname = '/feature/f1';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// Spy on window.history.pushState for URL sync assertions
const mockPushState = vi.fn();
const originalPushState = window.history.pushState.bind(window.history);
beforeAll(() => {
  window.history.pushState = mockPushState;
});
afterAll(() => {
  window.history.pushState = originalPushState;
});

vi.mock('@/app/actions/get-feature-phase-timings', () => ({
  getFeaturePhaseTimings: (...args: unknown[]) => mockGetPhaseTimings(...args),
}));

vi.mock('@/app/actions/get-feature-plan', () => ({
  getFeaturePlan: (...args: unknown[]) => mockGetPlan(...args),
}));

vi.mock('@/hooks/use-feature-logs', () => ({
  useFeatureLogs: () => ({ content: '', isConnected: false, error: null }),
}));

vi.mock('@/hooks/use-sound-action', () => ({
  useSoundAction: vi.fn(() => ({ play: vi.fn(), stop: vi.fn(), isPlaying: false })),
}));

vi.mock('@/hooks/use-deploy-action', () => ({
  useDeployAction: () => ({
    deploy: vi.fn(),
    stop: vi.fn(),
    deployLoading: false,
    stopLoading: false,
    deployError: null,
    status: null,
    url: null,
  }),
}));

vi.mock('@/components/common/deployment-status-badge', () => ({
  DeploymentStatusBadge: ({ status }: { status: string | null }) =>
    status ? <div data-testid="deployment-status-badge" data-status={status} /> : null,
}));

const defaultFeatureNode: FeatureNodeData = {
  name: 'Test Feature',
  description: 'A test feature',
  featureId: '#f1',
  lifecycle: 'implementation',
  state: 'running',
  progress: 50,
  repositoryPath: '/home/user/repo',
  branch: 'feat/test',
  hasPlan: true,
  hasAgentRun: true,
};

const sampleTimings: PhaseTimingData[] = [
  {
    agentRunId: 'run-001',
    phase: 'analyze',
    startedAt: '2024-01-01T00:00:00.000Z',
    completedAt: '2024-01-01T00:00:05.000Z',
    durationMs: 5000,
  },
];

const samplePlan: PlanData = {
  state: 'Ready',
  overview: 'Implementation plan',
  tasks: [{ title: 'Task 1', description: 'Do something', state: 'Todo', actionItems: [] }],
};

function makeSseEvent(
  featureId: string,
  eventType: NotificationEventType = NotificationEventType.PhaseCompleted
): NotificationEvent {
  return {
    featureId,
    eventType,
    agentRunId: 'run-001',
    featureName: 'Test Feature',
  } as NotificationEvent;
}

function renderTabs(props: Partial<FeatureDrawerTabsProps> = {}) {
  const defaultProps: FeatureDrawerTabsProps = {
    featureNode: defaultFeatureNode,
    featureId: '#f1',
    ...props,
  };
  return render(<FeatureDrawerTabs {...defaultProps} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPushState.mockClear();
  mockPathname = '/feature/f1';

  mockGetPhaseTimings.mockResolvedValue({ timings: sampleTimings, rejectionFeedback: [] });
  mockGetPlan.mockResolvedValue({ plan: samplePlan });
});

describe('FeatureDrawerTabs', () => {
  describe('tab triggers', () => {
    it('renders four tab triggers when hasPlan is true', () => {
      renderTabs();
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Log' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Plan' })).toBeInTheDocument();
    });

    it('hides Log tab when hasAgentRun is not set (adopted features)', () => {
      const { hasAgentRun: _, ...nodeWithoutRun } = defaultFeatureNode;
      renderTabs({
        featureNode: nodeWithoutRun as FeatureNodeData,
      });
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Log' })).not.toBeInTheDocument();
    });

    it('hides Plan tab when hasPlan is false', () => {
      renderTabs({
        featureNode: { ...defaultFeatureNode, hasPlan: false },
      });
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Log' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Plan' })).not.toBeInTheDocument();
    });

    it('hides Plan tab when hasPlan is undefined', () => {
      const { hasPlan: _, ...nodeWithoutPlan } = defaultFeatureNode;
      renderTabs({
        featureNode: nodeWithoutPlan as FeatureNodeData,
      });
      expect(screen.queryByRole('tab', { name: 'Plan' })).not.toBeInTheDocument();
    });

    it('shows Plan tab regardless of lifecycle when hasPlan is true', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'requirements',
          state: 'running',
          hasPlan: true,
        },
      });
      expect(screen.getByRole('tab', { name: 'Plan' })).toBeInTheDocument();
    });
  });

  describe('default tab', () => {
    it('overview tab is active by default', () => {
      renderTabs();
      const overviewTab = screen.getByRole('tab', { name: 'Overview' });
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });

    it('renders overview content by default', () => {
      renderTabs();
      // OverviewTab renders the status test id
      expect(screen.getByTestId('feature-drawer-status')).toBeInTheDocument();
    });
  });

  describe('lazy data fetching', () => {
    it('does not fetch any data on initial render', () => {
      renderTabs();
      expect(mockGetPhaseTimings).not.toHaveBeenCalled();
      expect(mockGetPlan).not.toHaveBeenCalled();
    });

    it('clicking Activity tab triggers phase timings fetch', async () => {
      const user = userEvent.setup();
      renderTabs();

      await user.click(screen.getByRole('tab', { name: 'Activity' }));

      expect(mockGetPhaseTimings).toHaveBeenCalledWith('#f1');
    });

    it('clicking Plan tab triggers plan fetch', async () => {
      const user = userEvent.setup();
      renderTabs();

      await user.click(screen.getByRole('tab', { name: 'Plan' }));

      expect(mockGetPlan).toHaveBeenCalledWith('#f1');
    });

    it('clicking Activity tab again does not trigger another fetch (cache hit)', async () => {
      const user = userEvent.setup();
      renderTabs();

      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);

      // Switch away then back
      await user.click(screen.getByRole('tab', { name: 'Overview' }));
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);
    });
  });

  describe('feature id change', () => {
    it('resets to Overview tab when featureId changes', async () => {
      const user = userEvent.setup();
      const { rerender } = renderTabs();

      // Switch to Activity tab
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('data-state', 'active');

      // Change featureId
      rerender(
        <FeatureDrawerTabs
          featureNode={{ ...defaultFeatureNode, featureId: '#f2' }}
          featureId="#f2"
        />
      );

      // Should reset to Overview
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    });
  });

  describe('SSE refresh', () => {
    it('re-fetches active tab data when SSE events arrive for this feature', async () => {
      const user = userEvent.setup();
      const { rerender } = renderTabs({ sseEvents: [] });

      // Switch to Activity tab and wait for initial fetch
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);

      // Simulate SSE event arriving for this feature
      rerender(
        <FeatureDrawerTabs
          featureNode={defaultFeatureNode}
          featureId="#f1"
          sseEvents={[makeSseEvent('#f1')]}
        />
      );

      // Should refresh the active tab
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(2);
    });

    it('refreshes activity data even when overview tab is active and SSE events arrive', () => {
      const { rerender } = renderTabs({ sseEvents: [] });

      // Simulate SSE event while on Overview
      rerender(
        <FeatureDrawerTabs
          featureNode={defaultFeatureNode}
          featureId="#f1"
          sseEvents={[makeSseEvent('#f1')]}
        />
      );

      // Activity data should be pre-fetched so it's ready when user switches tabs
      expect(mockGetPhaseTimings).toHaveBeenCalledWith('#f1');
      // Plan should NOT be fetched — only activity is always refreshed
      expect(mockGetPlan).not.toHaveBeenCalled();
    });

    it('ignores SSE events for a different feature', async () => {
      const user = userEvent.setup();
      const { rerender } = renderTabs({ sseEvents: [] });

      // Switch to Activity tab and wait for initial fetch
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);

      // Simulate SSE event for a DIFFERENT feature
      rerender(
        <FeatureDrawerTabs
          featureNode={defaultFeatureNode}
          featureId="#f1"
          sseEvents={[makeSseEvent('#other-feature')]}
        />
      );

      // Should NOT refresh — event is for a different feature
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);
    });

    it('does not re-process already-seen SSE events', async () => {
      const user = userEvent.setup();
      const events = [makeSseEvent('#f1')];
      const { rerender } = renderTabs({ sseEvents: [] });

      // Switch to Activity tab
      await user.click(screen.getByRole('tab', { name: 'Activity' }));
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(1);

      // First SSE event batch
      rerender(
        <FeatureDrawerTabs featureNode={defaultFeatureNode} featureId="#f1" sseEvents={events} />
      );
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(2);

      // Re-render with same events array (no new events)
      rerender(
        <FeatureDrawerTabs featureNode={defaultFeatureNode} featureId="#f1" sseEvents={events} />
      );
      // Should NOT re-fetch — no new events
      expect(mockGetPhaseTimings).toHaveBeenCalledTimes(2);
    });
  });

  describe('phase transition tab switching', () => {
    it('switches to merge-review tab when initialTab changes due to lifecycle transition', () => {
      const { rerender } = renderTabs({
        featureNode: { ...defaultFeatureNode, lifecycle: 'implementation', state: 'running' },
      });

      // Verify starting on overview
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');

      // Simulate lifecycle transition: implementation → review (waiting for merge)
      rerender(
        <FeatureDrawerTabs
          featureNode={{
            ...defaultFeatureNode,
            lifecycle: 'review',
            state: 'action-required',
          }}
          featureId="#f1"
          initialTab="merge-review"
        />
      );

      // Should switch to merge-review tab
      expect(screen.getByRole('tab', { name: 'Merge Review' })).toHaveAttribute(
        'data-state',
        'active'
      );
    });

    it('switches to prd-review tab when feature enters requirements action-required', () => {
      const { rerender } = renderTabs({
        featureNode: { ...defaultFeatureNode, lifecycle: 'requirements', state: 'running' },
      });

      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');

      // Simulate transition to requirements action-required
      rerender(
        <FeatureDrawerTabs
          featureNode={{
            ...defaultFeatureNode,
            lifecycle: 'requirements',
            state: 'action-required',
          }}
          featureId="#f1"
          initialTab="prd-review"
        />
      );

      expect(screen.getByRole('tab', { name: 'PRD Review' })).toHaveAttribute(
        'data-state',
        'active'
      );
    });

    it('falls back to overview when active tab becomes invisible after lifecycle change', () => {
      // Start with merge-review active
      const { rerender } = renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'review',
          state: 'action-required',
        },
        initialTab: 'merge-review',
      });

      expect(screen.getByRole('tab', { name: 'Merge Review' })).toHaveAttribute(
        'data-state',
        'active'
      );

      // Lifecycle transitions to maintain (done) — merge-review is no longer visible
      rerender(
        <FeatureDrawerTabs
          featureNode={{
            ...defaultFeatureNode,
            lifecycle: 'maintain',
            state: 'done',
          }}
          featureId="#f1"
          initialTab="overview"
        />
      );

      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    });
  });

  describe('merge-review tab visibility for maintain lifecycle', () => {
    it('includes merge-review tab when lifecycle=maintain and pr exists', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'maintain',
          state: 'done',
          pr: {
            url: 'https://github.com/org/repo/pull/42',
            number: 42,
            status: PrStatus.Merged,
            ciStatus: CiStatus.Success,
            commitHash: 'abc123',
          },
        },
      });

      expect(screen.getByRole('tab', { name: 'Merge History' })).toBeInTheDocument();
    });

    it('excludes merge-review tab when lifecycle=maintain and pr is undefined', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'maintain',
          state: 'done',
        },
      });

      expect(screen.queryByRole('tab', { name: 'Merge History' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Merge Review' })).not.toBeInTheDocument();
    });

    it('renders Merge History label when lifecycle=maintain (not Merge Review)', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'maintain',
          state: 'done',
          pr: {
            url: 'https://github.com/org/repo/pull/42',
            number: 42,
            status: PrStatus.Merged,
          },
        },
      });

      expect(screen.getByRole('tab', { name: 'Merge History' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Merge Review' })).not.toBeInTheDocument();
    });

    it('renders Merge Review label when lifecycle=review', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'review',
          state: 'action-required',
        },
      });

      expect(screen.getByRole('tab', { name: 'Merge Review' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Merge History' })).not.toBeInTheDocument();
    });
  });

  describe('merge-review readOnly prop threading', () => {
    it('passes readOnly to MergeReview when lifecycle=maintain (no action bar)', async () => {
      const user = userEvent.setup();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'maintain',
          state: 'done',
          pr: {
            url: 'https://github.com/org/repo/pull/42',
            number: 42,
            status: PrStatus.Merged,
            ciStatus: CiStatus.Success,
            commitHash: 'abc123',
          },
        },
        mergeData: {
          pr: {
            url: 'https://github.com/org/repo/pull/42',
            number: 42,
            status: PrStatus.Merged,
            ciStatus: CiStatus.Success,
            commitHash: 'abc123',
          },
          diffSummary: { filesChanged: 5, additions: 100, deletions: 20, commitCount: 3 },
        },
      });

      await user.click(screen.getByRole('tab', { name: 'Merge History' }));

      // readOnly=true means header says "Merge History"
      expect(screen.getByRole('heading', { name: 'Merge History' })).toBeInTheDocument();
      // But PR data still renders
      expect(screen.getByRole('link', { name: /PR #42/i })).toBeInTheDocument();
    });

    it('does not pass readOnly when lifecycle=review (action bar present)', async () => {
      const user = userEvent.setup();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'review',
          state: 'action-required',
        },
        mergeData: {
          pr: {
            url: 'https://github.com/org/repo/pull/42',
            number: 42,
            status: PrStatus.Open,
            ciStatus: CiStatus.Success,
            commitHash: 'abc123',
          },
          diffSummary: { filesChanged: 5, additions: 100, deletions: 20, commitCount: 3 },
        },
      });

      await user.click(screen.getByRole('tab', { name: 'Merge Review' }));

      // readOnly=false means the MergeReview header says "Merge Review" (not "Merge History")
      // Use heading role to distinguish from the tab trigger text
      expect(screen.getByRole('heading', { name: 'Merge Review' })).toBeInTheDocument();
      // PR data renders
      expect(screen.getByRole('link', { name: /PR #42/i })).toBeInTheDocument();
    });
  });

  describe('spec visualization tabs during implementation phase', () => {
    const sampleTechData = {
      name: 'Test Feature',
      summary: 'Tech summary for the feature',
      decisions: [
        {
          title: 'Use Vite',
          chosen: 'Vite',
          rationale: 'Fast dev server',
          rejected: ['Webpack'],
        },
      ],
      technologies: ['Vite'],
    };

    const sampleProductData = {
      question: 'Goal',
      context: 'A test feature',
      questions: [
        {
          question: 'Authentication strategy?',
          selectedOption: 'OAuth',
          rationale: 'Industry standard',
          wasRecommended: true,
        },
      ],
    };

    it('shows tech-decisions and product-decisions tabs during implementation+running', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'running',
        },
        techData: sampleTechData,
        productData: sampleProductData,
      });
      expect(screen.getByRole('tab', { name: 'Tech Decisions' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Product' })).toBeInTheDocument();
    });

    it('shows tech-decisions and product-decisions tabs during implementation+action-required', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'action-required',
        },
        techData: sampleTechData,
        productData: sampleProductData,
      });
      expect(screen.getByRole('tab', { name: 'Tech Decisions' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Product' })).toBeInTheDocument();
    });

    it('shows tech-decisions and product-decisions tabs during implementation+error', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'error',
        },
        techData: sampleTechData,
        productData: sampleProductData,
      });
      expect(screen.getByRole('tab', { name: 'Tech Decisions' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Product' })).toBeInTheDocument();
    });

    it('hides tech-decisions and product-decisions tabs in early phases (requirements/research)', () => {
      for (const lifecycle of ['requirements', 'research'] as const) {
        const { unmount } = renderTabs({
          featureNode: {
            ...defaultFeatureNode,
            lifecycle,
            state: 'running',
          },
        });
        expect(screen.queryByRole('tab', { name: 'Tech Decisions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Product' })).not.toBeInTheDocument();
        unmount();
      }
    });

    it('keeps tech-decisions and product-decisions tabs visible in review phase', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'review',
          state: 'action-required',
        },
        techData: sampleTechData,
        productData: sampleProductData,
      });
      expect(screen.getByRole('tab', { name: 'Tech Decisions' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Product' })).toBeInTheDocument();
    });

    it('keeps tech-decisions and product-decisions tabs visible in maintain phase', () => {
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'maintain',
          state: 'done',
        },
        techData: sampleTechData,
        productData: sampleProductData,
      });
      expect(screen.getByRole('tab', { name: 'Tech Decisions' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Product' })).toBeInTheDocument();
    });

    it('does not render the action bar in review/maintain even when tech data is present', async () => {
      const user = userEvent.setup();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'review',
          state: 'action-required',
        },
        techData: sampleTechData,
        onTechApprove: vi.fn(),
      });

      await user.click(screen.getByRole('tab', { name: 'Tech Decisions' }));

      // Action bar is gated to lifecycle=implementation + state=action-required.
      // Review's action-required state shows merge-review's action bar, not tech's.
      expect(screen.getByText('Technical Implementation Plan Review')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /approve plan/i })).not.toBeInTheDocument();
    });

    it('renders tech decisions content without action bar when state is not action-required', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'running',
        },
        techData: sampleTechData,
        onTechApprove: onApprove,
      });

      await user.click(screen.getByRole('tab', { name: 'Tech Decisions' }));

      expect(screen.getByText('Technical Implementation Plan Review')).toBeInTheDocument();
      // Action bar (approve button) must NOT be rendered for running state
      expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    });

    it('renders tech decisions content with action bar when state is action-required', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'action-required',
        },
        techData: sampleTechData,
        onTechApprove: onApprove,
      });

      await user.click(screen.getByRole('tab', { name: 'Tech Decisions' }));

      expect(screen.getByText('Technical Implementation Plan Review')).toBeInTheDocument();
      // Approve button should be present in action-required state
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    });

    it('renders product decisions content for any implementation state', async () => {
      const user = userEvent.setup();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'running',
        },
        productData: sampleProductData,
      });

      await user.click(screen.getByRole('tab', { name: 'Product' }));

      expect(screen.getByText('Product Decisions')).toBeInTheDocument();
      expect(screen.getByText('Authentication strategy?')).toBeInTheDocument();
    });

    it('shows empty-state message when tech data is unavailable and not loading', async () => {
      const user = userEvent.setup();
      renderTabs({
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'implementation',
          state: 'running',
        },
        techData: null,
        isTechLoading: false,
      });

      await user.click(screen.getByRole('tab', { name: 'Tech Decisions' }));

      expect(screen.getByText(/no technical decisions available/i)).toBeInTheDocument();
    });
  });

  describe('URL tab routing', () => {
    it('activates the tab specified in urlTab prop', () => {
      renderTabs({ urlTab: 'activity' });

      const activityTab = screen.getByRole('tab', { name: 'Activity' });
      expect(activityTab).toHaveAttribute('data-state', 'active');
    });

    it('defaults to overview when no urlTab is provided', () => {
      renderTabs();

      const overviewTab = screen.getByRole('tab', { name: 'Overview' });
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });

    it('ignores urlTab for a tab not visible in current lifecycle', () => {
      // prd-review is only visible in requirements+action-required, not implementation+running
      renderTabs({ urlTab: 'prd-review' });

      const overviewTab = screen.getByRole('tab', { name: 'Overview' });
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });

    it('updates URL via pushState when user clicks a different tab', async () => {
      const user = userEvent.setup();
      renderTabs();

      await user.click(screen.getByRole('tab', { name: 'Activity' }));

      expect(mockPushState).toHaveBeenCalledWith(null, '', '/feature/f1/activity');
    });

    it('updates URL to base path via pushState when switching back to overview', async () => {
      mockPathname = '/feature/f1/activity';
      const user = userEvent.setup();
      renderTabs({ urlTab: 'activity' });

      await user.click(screen.getByRole('tab', { name: 'Overview' }));

      expect(mockPushState).toHaveBeenCalledWith(null, '', '/feature/f1');
    });

    it('fetches lazy tab data when opened via URL', () => {
      renderTabs({ urlTab: 'activity' });

      // Activity is a lazy tab — should fetch on mount when opened via URL
      expect(mockGetPhaseTimings).toHaveBeenCalledWith('#f1');
    });

    it('fetches plan tab data when opened via URL', () => {
      renderTabs({ urlTab: 'plan' });

      expect(mockGetPlan).toHaveBeenCalledWith('#f1');
    });

    it('URL tab takes priority over initialTab prop', () => {
      renderTabs({
        urlTab: 'log',
        featureNode: {
          ...defaultFeatureNode,
          lifecycle: 'requirements',
          state: 'action-required',
        },
      });

      const logTab = screen.getByRole('tab', { name: 'Log' });
      expect(logTab).toHaveAttribute('data-state', 'active');
    });
  });
});
