/**
 * FleetTriageDrawer — unit tests (spec 111).
 *
 * The drawer's job is to show only exceptions and to make each one actionable
 * *here*, without the operator having to look anything up or leave the web UI
 * for a terminal. So the tests below pin three things the read-only version
 * got wrong: a row must be navigable, a gate must be approvable inline, and a
 * feed that is still loading must not claim the fleet is clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { FleetTriageDrawer } from '@/components/fleet/fleet-triage-drawer';
import {
  FleetTriageCategory,
  FleetTriagePriority,
  type FleetTriageItem,
} from '@shepai/core/domain/generated/output';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const approveFeature = vi.fn();
vi.mock('@/app/actions/approve-feature', () => ({
  approveFeature: (...args: unknown[]) => approveFeature(...args),
}));

const batchApproveFeatures = vi.fn();
vi.mock('@/app/actions/batch-approve-features', () => ({
  batchApproveFeatures: (...args: unknown[]) => batchApproveFeatures(...args),
}));

const retryFailedFleetFeatures = vi.fn();
vi.mock('@/app/actions/retry-failed-fleet-features', () => ({
  retryFailedFleetFeatures: (...args: unknown[]) => retryFailedFleetFeatures(...args),
}));

const NOW = '2026-09-11T12:00:00.000Z';

/** The drawer is controlled; most cases never change `open`. */
const noop = (): void => undefined;

function item(overrides: Partial<FleetTriageItem> = {}): FleetTriageItem {
  return {
    featureId: 'feat-1',
    featureName: 'Needs Plan Approval',
    slug: 'needs-plan',
    priority: FleetTriagePriority.p1,
    category: FleetTriageCategory.gate,
    reason: 'Waiting on the plan approval gate',
    runId: 'run-1',
    gateType: 'plan',
    createdAt: NOW,
    ...overrides,
  };
}

/** A P2 CI failure — present in the feed but neither approvable nor retryable. */
function ciItem(overrides: Partial<FleetTriageItem> = {}): FleetTriageItem {
  return item({
    featureId: 'feat-2',
    featureName: 'CSV Export',
    slug: 'csv-export',
    priority: FleetTriagePriority.p2,
    category: FleetTriageCategory.ci_failed,
    reason: 'CI is failing on the pull request',
    runId: 'run-2',
    gateType: undefined,
    ...overrides,
  });
}

/** A P2 crashed run — retryable, but never approvable. */
function crashItem(overrides: Partial<FleetTriageItem> = {}): FleetTriageItem {
  return item({
    featureId: 'feat-3',
    featureName: 'Auth Refactor',
    slug: 'auth-refactor',
    priority: FleetTriagePriority.p2,
    category: FleetTriageCategory.crash,
    reason: 'Agent run failed: spawn ENOENT',
    runId: 'run-3',
    gateType: undefined,
    ...overrides,
  });
}

describe('FleetTriageDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approveFeature.mockResolvedValue({ approved: true });
    batchApproveFeatures.mockResolvedValue({
      totalAttempted: 0,
      approvedCount: 0,
      approvedFeatureIds: [],
      failedCount: 0,
      failures: [],
      skippedCount: 0,
      skipped: [],
    });
    retryFailedFleetFeatures.mockResolvedValue({
      totalAttempted: 0,
      retriedCount: 0,
      retried: [],
      failedCount: 0,
      failures: [],
    });
  });

  it('renders nothing to act on as a healthy fleet, not an empty list', () => {
    render(<FleetTriageDrawer items={[]} open onOpenChange={noop} />);

    expect(screen.getByTestId('fleet-triage-empty')).toHaveTextContent(
      'Nothing needs you right now.'
    );
    expect(screen.queryAllByTestId('fleet-triage-item')).toHaveLength(0);
  });

  it('renders one row per exception with its reason and category', () => {
    render(<FleetTriageDrawer items={[item(), ciItem()]} open onOpenChange={noop} />);

    expect(screen.getAllByTestId('fleet-triage-item')).toHaveLength(2);
    expect(screen.getByText('Waiting on the plan approval gate')).toBeInTheDocument();
    expect(screen.getByText('CI is failing on the pull request')).toBeInTheDocument();
    expect(screen.getByText('Approval gate')).toBeInTheDocument();
    expect(screen.getByText('CI failed')).toBeInTheDocument();
  });

  it('summarises the item count in the title', () => {
    render(
      <FleetTriageDrawer items={[item(), item({ featureId: 'f2' })]} open onOpenChange={noop} />
    );
    expect(screen.getByText('Fleet triage — 2 items')).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- */
  /*  Loading — a feed in flight must not assert an all-clear          */
  /* ---------------------------------------------------------------- */

  describe('while the feed is loading', () => {
    it('shows skeleton rows instead of claiming nothing needs you', () => {
      render(<FleetTriageDrawer items={[]} open onOpenChange={noop} loading />);

      expect(screen.queryByTestId('fleet-triage-empty')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('fleet-triage-skeleton').length).toBeGreaterThan(0);
    });

    it('does not put a speculative item count in the title', () => {
      render(<FleetTriageDrawer items={[]} open onOpenChange={noop} loading />);

      expect(screen.queryByText(/Fleet triage — /)).not.toBeInTheDocument();
      expect(screen.getByText('Fleet triage')).toBeInTheDocument();
    });

    it('drops the skeletons once the items arrive', () => {
      const { rerender } = render(
        <FleetTriageDrawer items={[]} open onOpenChange={noop} loading />
      );
      rerender(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

      expect(screen.queryAllByTestId('fleet-triage-skeleton')).toHaveLength(0);
      expect(screen.getAllByTestId('fleet-triage-item')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Navigation — a row is a way into the feature, not a static div   */
  /* ---------------------------------------------------------------- */

  describe('row navigation', () => {
    it('makes each row a link to its feature with an accessible name', () => {
      render(<FleetTriageDrawer items={[item(), ciItem()]} open onOpenChange={noop} />);

      const first = screen.getByRole('link', { name: /Needs Plan Approval/ });
      expect(first).toHaveAttribute('href', '/feature/feat-1');

      const second = screen.getByRole('link', { name: /CSV Export/ });
      expect(second).toHaveAttribute('href', '/feature/feat-2');
    });

    it('closes the drawer when a row is followed, so the feature is not hidden behind it', () => {
      const onOpenChange = vi.fn();
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('link', { name: /Needs Plan Approval/ }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('no longer tells the operator to run a terminal command', () => {
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

      expect(screen.queryByText(/shep feat approve/)).not.toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Inline approve — gates resolve here                              */
  /* ---------------------------------------------------------------- */

  describe('inline approve', () => {
    it('offers Approve on a gate row and calls the approve action with its feature id', async () => {
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-feat-1'));

      await waitFor(() => expect(approveFeature).toHaveBeenCalledWith('feat-1'));
    });

    it('does not offer approve on a row that is not an approval gate', () => {
      render(<FleetTriageDrawer items={[ciItem()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-approve-feat-2')).not.toBeInTheDocument();
    });

    it('reports the approval in flight and blocks a double submit', async () => {
      let settle: (value: { approved: boolean }) => void = () => undefined;
      approveFeature.mockImplementation(
        () =>
          new Promise<{ approved: boolean }>((resolve) => {
            settle = resolve;
          })
      );

      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);
      const button = screen.getByTestId('fleet-triage-approve-feat-1');
      fireEvent.click(button);

      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      expect(approveFeature).toHaveBeenCalledTimes(1);

      settle({ approved: true });
      await waitFor(() => expect(button).not.toBeDisabled());
    });

    it('refreshes the feed after a successful approval', async () => {
      const onRefresh = vi.fn();
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-feat-1'));

      await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    });

    it('toasts the reason and leaves the row alone when approval is refused', async () => {
      approveFeature.mockResolvedValue({ approved: false, error: 'Feature has no agent run' });
      const onRefresh = vi.fn();
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={onRefresh} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-feat-1'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Feature has no agent run'));
      expect(onRefresh).not.toHaveBeenCalled();
      expect(screen.getByTestId('fleet-triage-approve-feat-1')).not.toBeDisabled();
    });

    it('toasts a thrown error rather than leaving the button stuck', async () => {
      approveFeature.mockRejectedValue(new Error('network down'));
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-feat-1'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('network down'));
      expect(screen.getByTestId('fleet-triage-approve-feat-1')).not.toBeDisabled();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Batch approve — the whole P1 gate backlog in one confirmed step  */
  /* ---------------------------------------------------------------- */

  describe('approve all P1', () => {
    const p1Gates = [
      item(),
      item({
        featureId: 'feat-9',
        featureName: 'Second Gate',
        slug: 'second-gate',
        runId: 'run-9',
      }),
    ];

    it('counts only the P1 gate rows it can actually approve', () => {
      render(
        <FleetTriageDrawer
          items={[
            ...p1Gates,
            ciItem(),
            item({
              featureId: 'feat-3',
              featureName: 'Low Gate',
              slug: 'low-gate',
              priority: FleetTriagePriority.p3,
            }),
          ]}
          open
          onOpenChange={noop}
        />
      );

      expect(screen.getByTestId('fleet-triage-approve-all')).toHaveTextContent(
        'Approve all P1 (2)'
      );
    });

    it('is absent when no P1 gate is waiting', () => {
      render(<FleetTriageDrawer items={[ciItem()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-approve-all')).not.toBeInTheDocument();
    });

    it('asks for confirmation before approving anything', async () => {
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-all'));

      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-all-confirm')).toBeInTheDocument()
      );
      expect(batchApproveFeatures).not.toHaveBeenCalled();
    });

    it('sends exactly the P1 gate ids once confirmed', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 2,
        approvedCount: 2,
        approvedFeatureIds: ['feat-1', 'feat-9'],
        failedCount: 0,
        failures: [],
      });
      const onRefresh = vi.fn();
      render(
        <FleetTriageDrawer
          items={[...p1Gates, ciItem()]}
          open
          onOpenChange={noop}
          onRefresh={onRefresh}
        />
      );

      fireEvent.click(screen.getByTestId('fleet-triage-approve-all'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-all-confirm')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-all-confirm'));

      await waitFor(() =>
        expect(batchApproveFeatures).toHaveBeenCalledWith({ featureIds: ['feat-1', 'feat-9'] })
      );
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    });

    it('does nothing when the confirmation is dismissed', async () => {
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-all'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-all-cancel')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-all-cancel'));

      expect(batchApproveFeatures).not.toHaveBeenCalled();
    });

    it('toasts the container error when the batch call fails outright', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 0,
        approvedCount: 0,
        approvedFeatureIds: [],
        failedCount: 0,
        failures: [],
        error: 'DI container not available',
      });
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-all'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-all-confirm')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-all-confirm'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('DI container not available'));
    });

    it('toasts partial failures so a silently skipped feature is visible', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 2,
        approvedCount: 1,
        approvedFeatureIds: ['feat-1'],
        failedCount: 1,
        failures: [{ featureId: 'feat-9', reason: 'worktree is dirty' }],
      });
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-all'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-all-confirm')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-all-confirm'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1 of 2'))
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Refresh                                                          */
  /* ---------------------------------------------------------------- */

  it('reports a refresh in flight and wires the refresh handler', () => {
    const onRefresh = vi.fn();
    render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={onRefresh} />);

    // `fireEvent` rather than `userEvent`: the drawer body sits inside vaul's
    // drag surface, and userEvent's synthetic pointer sequence trips its
    // transform maths under jsdom.
    fireEvent.click(screen.getByTestId('fleet-triage-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables refresh while one is already running', () => {
    render(
      <FleetTriageDrawer items={[item()]} open onOpenChange={noop} onRefresh={noop} refreshing />
    );

    expect(screen.getByTestId('fleet-triage-refresh')).toBeDisabled();
    expect(screen.getByTestId('fleet-triage-refresh')).toHaveTextContent('Refreshing…');
  });

  /* ---------------------------------------------------------------- */
  /*  Retry                                                            */
  /* ---------------------------------------------------------------- */

  describe('retrying a failed run', () => {
    it('offers Retry on a crashed row and sends just that feature', async () => {
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 1,
        retriedCount: 1,
        retried: [{ featureId: 'feat-3', featureName: 'Auth Refactor' }],
        failedCount: 0,
        failures: [],
      });

      render(<FleetTriageDrawer items={[crashItem()]} open onOpenChange={noop} />);
      fireEvent.click(screen.getByTestId('fleet-triage-retry-feat-3'));

      await waitFor(() =>
        expect(retryFailedFleetFeatures).toHaveBeenCalledWith({ featureIds: ['feat-3'] })
      );
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it('does not offer Retry on a CI failure row', () => {
      // `ci_failed` fires for any feature with a red CI run, whatever its agent
      // run is doing — retrying one could approve a merge gate. The use case
      // refuses it, so the surface must not offer it.
      render(<FleetTriageDrawer items={[ciItem()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-retry-feat-2')).toBeNull();
    });

    it('does not offer Retry on a gate row', () => {
      render(<FleetTriageDrawer items={[item()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-retry-feat-1')).toBeNull();
    });

    it('surfaces the refusal reason when the row could not be restarted', async () => {
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 1,
        retriedCount: 0,
        retried: [],
        failedCount: 1,
        failures: [
          {
            featureId: 'feat-3',
            featureName: 'Auth Refactor',
            reason: 'Agent is still running — stop it first before resuming',
          },
        ],
      });

      render(<FleetTriageDrawer items={[crashItem()]} open onOpenChange={noop} />);
      fireEvent.click(screen.getByTestId('fleet-triage-retry-feat-3'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Agent is still running — stop it first before resuming'
        )
      );
    });

    it('retries every failed row from the footer behind a confirmation', async () => {
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 2,
        retriedCount: 2,
        retried: [],
        failedCount: 0,
        failures: [],
      });

      render(
        <FleetTriageDrawer
          items={[crashItem(), crashItem({ featureId: 'feat-4', featureName: 'Parser' })]}
          open
          onOpenChange={noop}
        />
      );

      expect(screen.getByTestId('fleet-triage-retry-all')).toHaveTextContent(
        'Retry all failed (2)'
      );
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all'));
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all-confirm'));

      await waitFor(() =>
        expect(retryFailedFleetFeatures).toHaveBeenCalledWith({ featureIds: ['feat-3', 'feat-4'] })
      );
    });

    it('counts a feature once in the footer even when the feed lists it twice', () => {
      render(
        <FleetTriageDrawer
          items={[crashItem(), crashItem({ reason: 'listed again' })]}
          open
          onOpenChange={noop}
        />
      );

      expect(screen.getByTestId('fleet-triage-retry-all')).toHaveTextContent(
        'Retry all failed (1)'
      );
    });

    it('reports a partial batch as an error, never as done', async () => {
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 2,
        retriedCount: 1,
        retried: [],
        failedCount: 1,
        failures: [{ featureId: 'feat-4', featureName: 'Parser', reason: 'worktree is dirty' }],
      });

      render(
        <FleetTriageDrawer
          items={[crashItem(), crashItem({ featureId: 'feat-4', featureName: 'Parser' })]}
          open
          onOpenChange={noop}
        />
      );
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all'));
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all-confirm'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('1 of 2'))
      );
    });

    it('names a shared refusal reason once, listing the features it refused', async () => {
      // Twenty features refused for one reason used to be twenty copies of that
      // reason in a single toast. Group by reason so the toast stays readable.
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 3,
        retriedCount: 0,
        retried: [],
        failedCount: 3,
        failures: [
          { featureId: 'feat-3', featureName: 'Auth Refactor', reason: 'worktree is dirty' },
          { featureId: 'feat-4', featureName: 'Parser', reason: 'worktree is dirty' },
          { featureId: 'feat-5', featureName: 'Billing', reason: 'missing specPath' },
        ],
      });

      render(
        <FleetTriageDrawer
          items={[
            crashItem(),
            crashItem({ featureId: 'feat-4', featureName: 'Parser' }),
            crashItem({ featureId: 'feat-5', featureName: 'Billing' }),
          ]}
          open
          onOpenChange={noop}
        />
      );
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all'));
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all-confirm'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Retried 0 of 3 — Auth Refactor, Parser: worktree is dirty; Billing: missing specPath'
        )
      );
    });

    it('toasts the pause once when the queue is parked', async () => {
      const blockedReason =
        'The fleet admission queue is paused, so no agents were restarted. ' +
        'Release it with `shep fleet resume`, then retry.';
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 2,
        retriedCount: 0,
        retried: [],
        failedCount: 0,
        failures: [],
        blockedReason,
      });

      render(
        <FleetTriageDrawer
          items={[crashItem(), crashItem({ featureId: 'feat-4', featureName: 'Parser' })]}
          open
          onOpenChange={noop}
        />
      );
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all'));
      fireEvent.click(screen.getByTestId('fleet-triage-retry-all-confirm'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(blockedReason));
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('toasts the pause when a single row is retried on a parked queue', async () => {
      const blockedReason = 'The fleet admission queue is paused.';
      retryFailedFleetFeatures.mockResolvedValue({
        totalAttempted: 1,
        retriedCount: 0,
        retried: [],
        failedCount: 0,
        failures: [],
        blockedReason,
      });

      render(<FleetTriageDrawer items={[crashItem()]} open onOpenChange={noop} />);
      fireEvent.click(screen.getByTestId('fleet-triage-retry-feat-3'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(blockedReason));
    });

    it('hides the footer retry when nothing failed', () => {
      render(<FleetTriageDrawer items={[ciItem()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-retry-all')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Approve low-risk — the guardrails' safe subset (spec 111)        */
  /* ---------------------------------------------------------------- */

  describe('approve low-risk', () => {
    const p1Gates = [
      item(),
      item({
        featureId: 'feat-9',
        featureName: 'Second Gate',
        slug: 'second-gate',
        runId: 'run-9',
      }),
    ];

    const runBatch = async () => {
      fireEvent.click(screen.getByTestId('fleet-triage-approve-low-risk'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-low-risk-confirm')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-low-risk-confirm'));
    };

    it('offers the action whenever a P1 gate is waiting', () => {
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      expect(screen.getByTestId('fleet-triage-approve-low-risk')).toHaveTextContent(
        'Approve low-risk'
      );
    });

    it('is absent when no P1 gate is waiting', () => {
      render(<FleetTriageDrawer items={[ciItem()]} open onOpenChange={noop} />);

      expect(screen.queryByTestId('fleet-triage-approve-low-risk')).not.toBeInTheDocument();
    });

    it('explains the guardrail decision before anything is sent', async () => {
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-low-risk'));

      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-low-risk-dialog')).toBeInTheDocument()
      );
      expect(screen.getByText(/guardrail rules/i)).toBeInTheDocument();
      expect(batchApproveFeatures).not.toHaveBeenCalled();
    });

    it('sends the P1 gate ids with lowRisk, never the whole fleet', async () => {
      const onRefresh = vi.fn();
      render(
        <FleetTriageDrawer
          items={[...p1Gates, ciItem()]}
          open
          onOpenChange={noop}
          onRefresh={onRefresh}
        />
      );

      await runBatch();

      await waitFor(() =>
        expect(batchApproveFeatures).toHaveBeenCalledWith({
          featureIds: ['feat-1', 'feat-9'],
          lowRisk: true,
        })
      );
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    });

    it('does nothing when the confirmation is dismissed', async () => {
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      fireEvent.click(screen.getByTestId('fleet-triage-approve-low-risk'));
      await waitFor(() =>
        expect(screen.getByTestId('fleet-triage-approve-low-risk-cancel')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('fleet-triage-approve-low-risk-cancel'));

      expect(batchApproveFeatures).not.toHaveBeenCalled();
    });

    it('reports what it approved and what the guardrails left for the user', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 2,
        approvedCount: 1,
        approvedFeatureIds: ['feat-1'],
        failedCount: 0,
        failures: [],
        skippedCount: 1,
        skipped: [{ featureId: 'feat-9', reason: 'diff is 1200 lines (max 400)' }],
      });
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      await runBatch();

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          'Approved 1 of 2 — 1 left for you',
          expect.objectContaining({
            description: expect.stringContaining('Second Gate: diff is 1200 lines'),
          })
        )
      );
    });

    it('refuses loudly when no gate is provably low-risk', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 2,
        approvedCount: 0,
        approvedFeatureIds: [],
        failedCount: 0,
        failures: [],
        skippedCount: 2,
        skipped: [
          { featureId: 'feat-1', reason: 'No guardrail rules configured for the plan gate' },
          { featureId: 'feat-9', reason: 'No guardrail rules configured for the plan gate' },
        ],
      });
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      await runBatch();

      await waitFor(() =>
        expect(toast.warning).toHaveBeenCalledWith(
          'No gate is provably low-risk — nothing was approved',
          expect.objectContaining({
            description: expect.stringContaining(
              'Needs Plan Approval, Second Gate: No guardrail rules configured'
            ),
          })
        )
      );
    });

    it('says so plainly when every gate was approved', async () => {
      batchApproveFeatures.mockResolvedValue({
        totalAttempted: 2,
        approvedCount: 2,
        approvedFeatureIds: ['feat-1', 'feat-9'],
        failedCount: 0,
        failures: [],
        skippedCount: 0,
        skipped: [],
      });
      render(<FleetTriageDrawer items={p1Gates} open onOpenChange={noop} />);

      await runBatch();

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith('Approved 2 features — agents resuming')
      );
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });
});
