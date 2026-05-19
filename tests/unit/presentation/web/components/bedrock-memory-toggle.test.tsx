import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockEnableBedrock = vi.fn();

vi.mock('@/app/actions/enable-bedrock.action', () => ({
  enableBedrock: (...args: unknown[]) => mockEnableBedrock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { BedrockMemoryToggle } = await import(
  '../../../../../src/presentation/web/components/bedrock-memory-toggle.js'
);

describe('BedrockMemoryToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the toggle with the label', () => {
    render(<BedrockMemoryToggle applicationId="app-1" initialEnabled={false} />);

    expect(screen.getByTestId('bedrock-memory-toggle')).toBeDefined();
    expect(screen.getByText(/Bedrock memory/i)).toBeDefined();
  });

  it('reflects the initial enabled state', () => {
    render(<BedrockMemoryToggle applicationId="app-1" initialEnabled={true} />);

    const sw = screen.getByTestId('bedrock-memory-toggle');
    expect(sw.getAttribute('data-state')).toBe('checked');
  });

  it('calls enableBedrock and flips the switch on success', async () => {
    mockEnableBedrock.mockResolvedValue({ ok: true, bedrockEnabled: true });

    render(<BedrockMemoryToggle applicationId="app-1" initialEnabled={false} />);

    fireEvent.click(screen.getByTestId('bedrock-memory-toggle'));

    await waitFor(() => {
      expect(mockEnableBedrock).toHaveBeenCalledWith('app-1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('bedrock-memory-toggle').getAttribute('data-state')).toBe(
        'checked'
      );
    });
  });

  it('reverts the switch and shows remediation on error', async () => {
    mockEnableBedrock.mockResolvedValue({
      ok: false,
      code: 'PIPX_NOT_INSTALLED',
      remediation: 'Install pipx with brew install pipx',
    });

    render(<BedrockMemoryToggle applicationId="app-1" initialEnabled={false} />);

    fireEvent.click(screen.getByTestId('bedrock-memory-toggle'));

    await waitFor(() => {
      expect(mockEnableBedrock).toHaveBeenCalledWith('app-1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('bedrock-memory-toggle').getAttribute('data-state')).toBe(
        'unchecked'
      );
    });

    expect(screen.getByTestId('bedrock-toggle-remediation').textContent).toContain('pipx');
  });

  it('does nothing when toggled off (this M ships enable-only)', async () => {
    render(<BedrockMemoryToggle applicationId="app-1" initialEnabled={true} />);

    fireEvent.click(screen.getByTestId('bedrock-memory-toggle'));

    // Disable flow is not part of this milestone — the action is not invoked.
    expect(mockEnableBedrock).not.toHaveBeenCalled();
  });
});
