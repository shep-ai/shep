import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscoveryRunStatus } from '@shepai/core/domain/generated/output';
import { DiscoveryPanel } from '@/components/features/opportunities/discovery-panel';

const actions = vi.hoisted(() => ({ runDiscovery: vi.fn(), setDiscoverySchedule: vi.fn() }));
vi.mock('@/app/actions/discovery', () => ({
  runDiscovery: (...a: unknown[]) => actions.runDiscovery(...a),
  setDiscoverySchedule: (...a: unknown[]) => actions.setDiscoverySchedule(...a),
}));

const T = new Date('2026-10-05T10:00:00Z');
const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('DiscoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.runDiscovery.mockResolvedValue({ ok: true });
    actions.setDiscoverySchedule.mockResolvedValue({ ok: true });
  });

  it('runs discovery now and shows the last run', async () => {
    render(
      <DiscoveryPanel
        spaceId="s-acme"
        everyHours={24}
        latest={{
          id: 'r1',
          spaceId: 's-acme',
          status: DiscoveryRunStatus.Succeeded,
          signalsRead: 9,
          proposed: 2,
          dropped: 1,
          finishedAt: T,
          createdAt: T,
          updatedAt: T,
        }}
        run={run}
      />
    );
    expect(screen.getByText(/2 proposed from 9 signals/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('discovery-run'));
    expect(actions.runDiscovery).toHaveBeenCalledWith('s-acme');
  });

  it('shows a failed run and changes the schedule', async () => {
    render(
      <DiscoveryPanel
        spaceId="s-acme"
        latest={{
          id: 'r1',
          spaceId: 's-acme',
          status: DiscoveryRunStatus.Failed,
          signalsRead: 3,
          proposed: 0,
          dropped: 0,
          error: 'agent timed out',
          createdAt: T,
          updatedAt: T,
        }}
        run={run}
      />
    );
    expect(screen.getByText(/agent timed out/)).toBeInTheDocument();
    expect(screen.getByTestId('discovery-schedule')).toHaveValue('');
    await userEvent.selectOptions(screen.getByTestId('discovery-schedule'), '24');
    expect(actions.setDiscoverySchedule).toHaveBeenCalledWith('s-acme', 24);
    await userEvent.selectOptions(screen.getByTestId('discovery-schedule'), '');
    expect(actions.setDiscoverySchedule).toHaveBeenLastCalledWith('s-acme', null);
  });

  it('says when discovery never ran', () => {
    render(<DiscoveryPanel spaceId="s-acme" run={run} />);
    expect(screen.getByText(/has not run/)).toBeInTheDocument();
  });
});
