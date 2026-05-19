/**
 * FindingActions component tests (feature 098, phase 7, task-44).
 */

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FindingActions } from '@/components/features/aspm/finding-actions';

describe('FindingActions', () => {
  it('routes click → declareException action', async () => {
    const declareException = vi.fn().mockResolvedValue(undefined);
    render(<FindingActions findingId="f-1" workItemId={null} actions={{ declareException }} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('finding-action-declare-exception'));
    });
    await waitFor(() => expect(declareException).toHaveBeenCalledTimes(1));
    expect(declareException.mock.calls[0]![0]).toMatchObject({ findingId: 'f-1' });
    expect(screen.getByTestId('finding-actions-status').textContent).toContain('✓');
  });

  it('routes click → revokeException action', async () => {
    const revokeException = vi.fn().mockResolvedValue(undefined);
    render(<FindingActions findingId="f-1" workItemId={null} actions={{ revokeException }} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('finding-action-revoke-exception'));
    });
    await waitFor(() => expect(revokeException).toHaveBeenCalledWith('f-1'));
  });

  it('routes click → convertToWorkItem and updates linked label', async () => {
    const convertToWorkItem = vi.fn().mockResolvedValue({ workItemId: 'wi-newone1' });
    render(<FindingActions findingId="f-1" workItemId={null} actions={{ convertToWorkItem }} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('finding-action-convert-to-work-item'));
    });
    await waitFor(() => expect(convertToWorkItem).toHaveBeenCalledWith('f-1'));
    expect(screen.getByTestId('finding-action-convert-to-work-item').textContent).toContain(
      'wi-newon'
    );
  });

  it('disables the convert button when already linked', () => {
    render(<FindingActions findingId="f-1" workItemId="wi-existing" />);
    expect(screen.getByTestId('finding-action-convert-to-work-item')).toBeDisabled();
  });

  it('reports a failure message when an action throws', async () => {
    const declareException = vi.fn().mockRejectedValue(new Error('boom'));
    render(<FindingActions findingId="f-1" workItemId={null} actions={{ declareException }} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('finding-action-declare-exception'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('finding-actions-status').textContent).toContain('boom')
    );
  });
});
