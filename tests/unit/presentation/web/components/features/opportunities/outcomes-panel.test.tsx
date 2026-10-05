import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpportunityStatus } from '@shepai/core/domain/generated/output';
import { OutcomesPanel } from '@/components/features/opportunities/outcomes-panel';
import { OpportunityActions } from '@/components/features/opportunities/opportunity-actions';
import {
  CALIBRATION,
  PENDING_OUTCOME,
  SOLVED_OUTCOME,
} from '@/components/features/opportunities/outcomes-fixtures';

const actions = vi.hoisted(() => ({
  checkOutcomes: vi.fn(),
  shipOpportunity: vi.fn(),
  tellCustomers: vi.fn(),
  recordOutcomeHours: vi.fn(),
}));
vi.mock('@/app/actions/outcomes', () =>
  Object.fromEntries(
    Object.entries(actions).map(([name, fn]) => [name, (...a: unknown[]) => fn(...a)])
  )
);
vi.mock('@/app/actions/manage-opportunities', () => ({}));

const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('OutcomesPanel (spec 130)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true });
  });

  it('shows verdicts with their counts and the calibration', () => {
    render(
      <OutcomesPanel
        outcomes={[PENDING_OUTCOME, SOLVED_OUTCOME]}
        calibration={CALIBRATION}
        run={run}
      />
    );
    const solved = screen.getByTestId(`outcome-${SOLVED_OUTCOME.opportunity.id}`);
    expect(solved).toHaveTextContent('Solved');
    expect(solved).toHaveTextContent('6 similar reports before, 2 after');
    expect(screen.getByTestId(`outcome-${PENDING_OUTCOME.opportunity.id}`)).toHaveTextContent(
      'Judged on'
    );
    expect(screen.getByTestId('outcomes-calibration')).toHaveTextContent('1.4×');
    expect(screen.getByTestId('outcomes-calibration')).toHaveTextContent('3 of 4');
  });

  it('checks now, marks customers told and records hours', async () => {
    render(<OutcomesPanel outcomes={[PENDING_OUTCOME]} calibration={CALIBRATION} run={run} />);
    const id = PENDING_OUTCOME.opportunity.id;
    await userEvent.click(screen.getByTestId('outcomes-check'));
    expect(actions.checkOutcomes).toHaveBeenCalled();

    expect(screen.getByTestId(`outcome-customers-${id}`)).toHaveTextContent('Globex');
    await userEvent.click(screen.getByTestId(`outcome-tell-${id}`));
    expect(actions.tellCustomers).toHaveBeenCalledWith(id);

    await userEvent.type(screen.getByTestId(`outcome-hours-${id}`), '9');
    await userEvent.click(screen.getByTestId(`outcome-hours-save-${id}`));
    expect(actions.recordOutcomeHours).toHaveBeenCalledWith(id, 9);
  });

  it('says when nothing has shipped', () => {
    render(
      <OutcomesPanel outcomes={[]} calibration={{ judged: 0, solved: 0, timed: 0 }} run={run} />
    );
    expect(screen.getByTestId('outcomes-empty')).toBeInTheDocument();
  });

  it('offers to mark a building opportunity shipped', async () => {
    render(
      <OpportunityActions
        opportunity={{ ...SOLVED_OUTCOME.opportunity, status: OpportunityStatus.Building }}
        projects={[]}
        run={run}
      />
    );
    await userEvent.click(screen.getByTestId(`opportunity-ship-${SOLVED_OUTCOME.opportunity.id}`));
    expect(actions.shipOpportunity).toHaveBeenCalledWith(SOLVED_OUTCOME.opportunity.id);
    expect(screen.queryByTestId(`opportunity-build-${SOLVED_OUTCOME.opportunity.id}`)).toBeNull();
  });
});
