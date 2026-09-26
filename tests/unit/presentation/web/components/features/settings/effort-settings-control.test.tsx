import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { EffortSettingsControl } from '@/components/features/settings/effort-settings-control';

const mockUpdateDefaultEffort = vi.fn();

vi.mock('@/app/actions/update-default-effort', () => ({
  updateDefaultEffort: (...args: unknown[]) => mockUpdateDefaultEffort(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Radix Select is not drivable in jsdom; stand in with buttons that call onChange.
vi.mock('@/components/common/effort-select', () => ({
  EffortSelect: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (effort: string | undefined) => void;
  }) => (
    <div>
      <span data-testid="current-effort">{value ?? 'default'}</span>
      <button onClick={() => onChange('high')}>pick-high</button>
      <button onClick={() => onChange(undefined)}>pick-default</button>
    </div>
  ),
}));

describe('EffortSettingsControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDefaultEffort.mockResolvedValue({ ok: true });
  });

  it('shows the initial effort', () => {
    render(<EffortSettingsControl initialEffort={'low' as never} />);
    expect(screen.getByTestId('current-effort')).toHaveTextContent('low');
  });

  it('saves a picked level', async () => {
    render(<EffortSettingsControl />);
    fireEvent.click(screen.getByText('pick-high'));

    await waitFor(() => expect(mockUpdateDefaultEffort).toHaveBeenCalledWith('high'));
    expect(screen.getByTestId('current-effort')).toHaveTextContent('high');
  });

  it('sends null to clear the effort when "agent default" is picked', async () => {
    render(<EffortSettingsControl initialEffort={'max' as never} />);
    fireEvent.click(screen.getByText('pick-default'));

    await waitFor(() => expect(mockUpdateDefaultEffort).toHaveBeenCalledWith(null));
    expect(screen.getByTestId('current-effort')).toHaveTextContent('default');
  });

  it('reverts and reports the error when saving fails', async () => {
    mockUpdateDefaultEffort.mockResolvedValue({ ok: false, error: 'boom' });
    render(<EffortSettingsControl initialEffort={'low' as never} />);
    fireEvent.click(screen.getByText('pick-high'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    expect(screen.getByTestId('current-effort')).toHaveTextContent('low');
  });
});
