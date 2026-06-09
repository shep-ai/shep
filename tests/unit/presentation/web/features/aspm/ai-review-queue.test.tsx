/**
 * AiReviewQueue component tests (feature 098, phase 8, task-51).
 */

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AiReviewQueue } from '@/components/features/aspm/ai-review-queue';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '@shepai/core/domain/generated/output';

const now = new Date('2026-05-19T12:00:00Z');

function s(overrides: Partial<AiChangeRiskSignal>): AiChangeRiskSignal {
  return {
    id: 's-1',
    applicationId: 'app',
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.High,
    summary: 'Sample',
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AiChangeRiskSignal;
}

describe('AiReviewQueue', () => {
  it('renders the loading placeholder when loading=true', () => {
    render(<AiReviewQueue signals={[]} loading />);
    expect(screen.getByTestId('ai-review-queue-loading')).toBeTruthy();
  });

  it('renders the error placeholder when an error is provided', () => {
    render(<AiReviewQueue signals={[]} error="boom" />);
    expect(screen.getByTestId('ai-review-queue-error').textContent).toContain('boom');
  });

  it('renders the empty placeholder for an empty queue', () => {
    render(<AiReviewQueue signals={[]} />);
    expect(screen.getByTestId('ai-review-queue-empty')).toBeTruthy();
  });

  it('renders a row per signal', () => {
    render(<AiReviewQueue signals={[s({ id: 'a' }), s({ id: 'b' })]} />);
    expect(screen.getByTestId('ai-review-queue-row-a')).toBeTruthy();
    expect(screen.getByTestId('ai-review-queue-row-b')).toBeTruthy();
  });

  it('routes click → graduateSignal action and updates the state badge', async () => {
    const graduateSignal = vi.fn().mockResolvedValue({ findingId: 'f-1' });
    render(<AiReviewQueue signals={[s({ id: 'sig-1' })]} actions={{ graduateSignal }} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-review-action-graduate-sig-1'));
    });

    await waitFor(() => expect(graduateSignal).toHaveBeenCalledWith('sig-1'));
    expect(screen.getByTestId('ai-review-queue-state-sig-1').textContent).toContain(
      AiSignalState.GraduatedToFinding
    );
    expect(screen.getByTestId('ai-review-status-sig-1').textContent).toContain('✓');
  });

  it('routes click → dismissSignal action and updates the state badge', async () => {
    const dismissSignal = vi.fn().mockResolvedValue(undefined);
    render(<AiReviewQueue signals={[s({ id: 'sig-2' })]} actions={{ dismissSignal }} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-review-action-dismiss-sig-2'));
    });

    await waitFor(() => expect(dismissSignal).toHaveBeenCalledTimes(1));
    expect(dismissSignal.mock.calls[0]![0]).toMatchObject({ signalId: 'sig-2' });
    expect(screen.getByTestId('ai-review-queue-state-sig-2').textContent).toContain(
      AiSignalState.Dismissed
    );
  });

  it('disables action buttons for terminal-state rows', () => {
    render(
      <AiReviewQueue
        signals={[
          s({
            id: 'grad',
            state: AiSignalState.GraduatedToFinding,
            graduatedFindingId: 'f-x',
          }),
        ]}
      />
    );
    expect(screen.getByTestId('ai-review-action-graduate-grad')).toBeDisabled();
    expect(screen.getByTestId('ai-review-action-dismiss-grad')).toBeDisabled();
  });

  it('reports a failure message when an action throws', async () => {
    const graduateSignal = vi.fn().mockRejectedValue(new Error('boom'));
    render(<AiReviewQueue signals={[s({ id: 'sig-err' })]} actions={{ graduateSignal }} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ai-review-action-graduate-sig-err'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('ai-review-status-sig-err').textContent).toContain('boom')
    );
    // State badge remains Open since the graduation failed.
    expect(screen.getByTestId('ai-review-queue-state-sig-err').textContent).toContain(
      AiSignalState.Open
    );
  });
});
