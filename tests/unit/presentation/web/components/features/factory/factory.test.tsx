import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FactoryPageClient } from '@/components/features/factory/factory-page-client';
import { AutopilotForm } from '@/components/features/factory/autopilot-form';
import { PROJECTS, RUN, SPACES, STATUS } from '@/components/features/factory/factory-fixtures';

const actions = vi.hoisted(() => ({ setAutopilot: vi.fn(), runAutopilot: vi.fn() }));
vi.mock('@/app/actions/autopilot', () => ({
  setAutopilot: (...a: unknown[]) => actions.setAutopilot(...a),
  runAutopilot: (...a: unknown[]) => actions.runAutopilot(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('Factory page (spec 132)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.setAutopilot.mockResolvedValue({ ok: true });
    actions.runAutopilot.mockResolvedValue({ ok: true });
  });

  it('shows the status counts, the last passes and links to the pages behind them', () => {
    render(<FactoryPageClient spaces={SPACES} status={STATUS} runs={[RUN]} projects={PROJECTS} />);
    expect(screen.getByTestId('factory-line')).toHaveTextContent('12/16');
    expect(screen.getByTestId('factory-incidents')).toHaveTextContent('1');
    expect(screen.getByTestId('factory-customers')).toHaveTextContent('2');
    expect(screen.getByTestId('factory-incidents').closest('a')).toHaveAttribute(
      'href',
      '/incidents?space=acme'
    );
    expect(screen.getByTestId(`autopilot-run-${RUN.id}`)).toHaveTextContent('PAY-42');
    expect(screen.getByTestId(`autopilot-run-${RUN.id}`)).toHaveTextContent('no repository');
  });

  it('shows why the page could not load', () => {
    render(<FactoryPageClient spaces={SPACES} runs={[]} projects={[]} loadError="No space" />);
    expect(screen.getByTestId('factory-error')).toHaveTextContent('No space');
  });

  it('saves the autopilot policy and runs a pass now', async () => {
    render(
      <AutopilotForm
        space="space-acme"
        policy={STATUS.autopilot.policy}
        projects={PROJECTS}
        run={run}
      />
    );
    await userEvent.click(screen.getByTestId('autopilot-merge-fixes'));
    await userEvent.clear(screen.getByTestId('autopilot-budget'));
    await userEvent.type(screen.getByTestId('autopilot-budget'), '5');
    await userEvent.click(screen.getByTestId('autopilot-save'));
    expect(actions.setAutopilot).toHaveBeenCalledWith('space-acme', {
      investigateUrgent: true,
      fixConfident: true,
      mergeFixes: true,
      fillLine: true,
      project: 'p-pay',
      dailyFixBudget: 5,
    });
    await userEvent.click(screen.getByTestId('autopilot-run'));
    expect(actions.runAutopilot).toHaveBeenCalledWith('space-acme');
  });

  it('clears the project when none is chosen', async () => {
    render(
      <AutopilotForm
        space="space-acme"
        policy={{ ...STATUS.autopilot.policy, fillLine: false }}
        projects={PROJECTS}
        run={run}
      />
    );
    await userEvent.selectOptions(screen.getByTestId('autopilot-project'), '');
    await userEvent.click(screen.getByTestId('autopilot-save'));
    expect(actions.setAutopilot).toHaveBeenCalledWith(
      'space-acme',
      expect.objectContaining({ project: null })
    );
  });
});
