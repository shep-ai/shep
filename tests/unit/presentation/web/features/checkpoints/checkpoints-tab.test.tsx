/**
 * Feature drawer → Checkpoints (spec 138).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckpointRestoreBlocker } from '@shepai/core/domain/generated/output';
import {
  fixtureCheckpointDiff,
  fixtureCheckpointList,
} from '@/components/features/checkpoints/checkpoint-fixtures';

const { mockList, mockDiff, mockRestore, toastSuccess, toastError } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockDiff: vi.fn(),
  mockRestore: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/app/actions/feature-checkpoints', () => ({
  listFeatureCheckpoints: (...args: unknown[]) => mockList(...args),
  getFeatureCheckpointDiff: (...args: unknown[]) => mockDiff(...args),
  restoreFeatureCheckpoint: (...args: unknown[]) => mockRestore(...args),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));

import { CheckpointsTab } from '@/components/features/checkpoints/checkpoints-tab';

describe('CheckpointsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ ok: true, data: fixtureCheckpointList });
    mockDiff.mockResolvedValue({ ok: true, data: fixtureCheckpointDiff });
    mockRestore.mockResolvedValue({
      ok: true,
      data: { restored: fixtureCheckpointList.checkpoints[2], safety: null },
    });
  });

  it('lists the steps and shows what the latest one changed', async () => {
    render(<CheckpointsTab featureId="feat-1" />);

    expect(await screen.findByText('0003-implement')).toBeInTheDocument();
    expect(screen.getByText('0000-baseline')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockDiff).toHaveBeenCalledWith({ featureId: 'feat-1', to: '0004-repair_research' })
    );
    expect((await screen.findAllByText(/login\.ts/)).length).toBeGreaterThan(0);
  });

  it('shows the diff of the step the user selects', async () => {
    const user = userEvent.setup();
    render(<CheckpointsTab featureId="feat-1" />);

    await user.click(await screen.findByRole('button', { name: /^0002-plan/ }));

    await waitFor(() =>
      expect(mockDiff).toHaveBeenLastCalledWith({ featureId: 'feat-1', to: '0002-plan' })
    );
  });

  it('does not diff the baseline: nothing came before it', async () => {
    const user = userEvent.setup();
    render(<CheckpointsTab featureId="feat-1" />);
    await screen.findByText('0000-baseline');
    mockDiff.mockClear();

    await user.click(screen.getByRole('button', { name: /^0000-baseline/ }));

    expect(screen.getByText(/starting point/i)).toBeInTheDocument();
    expect(mockDiff).not.toHaveBeenCalled();
  });

  it('compares any two steps', async () => {
    const user = userEvent.setup();
    render(<CheckpointsTab featureId="feat-1" />);
    await screen.findByText('0003-implement');

    await user.click(screen.getByRole('radio', { name: 'Compare' }));
    await waitFor(() =>
      expect(mockDiff).toHaveBeenLastCalledWith({
        featureId: 'feat-1',
        from: '0000-baseline',
        to: '0004-repair_research',
      })
    );

    await user.selectOptions(screen.getByLabelText('From'), '0002-plan');
    await waitFor(() =>
      expect(mockDiff).toHaveBeenLastCalledWith({
        featureId: 'feat-1',
        from: '0002-plan',
        to: '0004-repair_research',
      })
    );
  });

  it('restores after confirmation, then reloads the list', async () => {
    const user = userEvent.setup();
    render(<CheckpointsTab featureId="feat-1" />);

    await user.click(
      await screen.findByRole('button', { name: 'Restore the worktree to 0002-plan' })
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Restore the worktree to 0002-plan?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(mockRestore).toHaveBeenCalledWith({ featureId: 'feat-1', step: '0002-plan' })
    );
    expect(toastSuccess).toHaveBeenCalled();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('reports a refused restore', async () => {
    mockRestore.mockResolvedValue({ ok: false, error: 'Cannot restore checkpoint: nope' });
    const user = userEvent.setup();
    render(<CheckpointsTab featureId="feat-1" />);

    await user.click(
      await screen.findByRole('button', { name: 'Restore the worktree to 0002-plan' })
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restore' })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Restore failed', expect.anything())
    );
  });

  it('disables restore and says why when core reports a blocker', async () => {
    mockList.mockResolvedValue({
      ok: true,
      data: { ...fixtureCheckpointList, restoreBlocker: CheckpointRestoreBlocker.AgentRunning },
    });
    render(<CheckpointsTab featureId="feat-1" />);

    expect(
      await screen.findByText('Restore is unavailable while the agent is running.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restore the worktree to 0002-plan' })
    ).toBeDisabled();
  });

  it('shows the empty state', async () => {
    mockList.mockResolvedValue({ ok: true, data: { ...fixtureCheckpointList, checkpoints: [] } });
    render(<CheckpointsTab featureId="feat-1" />);
    expect(await screen.findByText(/No checkpoints yet/)).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    mockList.mockResolvedValue({ ok: false, error: 'Feature not found: "feat-1"' });
    render(<CheckpointsTab featureId="feat-1" />);
    expect(await screen.findByText('Feature not found: "feat-1"')).toBeInTheDocument();
  });
});
