import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HarnessEvalsPanel } from '@/components/features/harness/harness-evals-panel';
import { fixtureEvalListing } from '@/components/features/harness/harness-fixtures';

const { mockStart } = vi.hoisted(() => ({ mockStart: vi.fn() }));
vi.mock('@/app/actions/harness-queries', async () => {
  const f = await import('@/components/features/harness/harness-fixtures');
  return {
    listHarnessEvals: vi.fn().mockResolvedValue({ ok: true, data: f.fixtureEvalListing }),
    getHarnessEvalReport: vi.fn().mockResolvedValue({ ok: true, data: f.fixtureEvalReport }),
  };
});
vi.mock('@/app/actions/harness-commands', () => ({
  startHarnessEval: (...a: unknown[]) => mockStart(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('HarnessEvalsPanel', () => {
  it('shows the baseline vs query-aware comparison of the selected run', async () => {
    render(<HarnessEvalsPanel initial={fixtureEvalListing} />);
    expect(await screen.findByTestId('harness-eval-report')).toBeDefined();
    expect(screen.getByText('54,795')).toBeDefined();
    expect(screen.getByText('13,640')).toBeDefined();
    expect(screen.getByText('-75%')).toBeDefined();
  });

  it('starts a run of the chosen suite with repeats', async () => {
    mockStart.mockResolvedValue({ ok: true, data: { runId: 'eval-2' } });
    render(<HarnessEvalsPanel initial={fixtureEvalListing} />);
    fireEvent.change(screen.getByLabelText('Repeats'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('harness-eval-run'));
    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith({ suite: 'long-output', repeats: 3 })
    );
  });
});
