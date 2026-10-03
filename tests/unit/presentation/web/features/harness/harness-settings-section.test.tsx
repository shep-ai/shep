import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DecisionProviderKind } from '@shepai/core/domain/generated/output';
import { HarnessSettingsSection } from '@/components/features/settings/harness-settings-section';

const mockUpdate = vi.fn();
vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdate(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('HarnessSettingsSection', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ success: true });
  });

  it('shows no endpoint fields for the deterministic provider', () => {
    render(<HarnessSettingsSection />);
    expect(screen.getByTestId('harness-settings-section')).toBeDefined();
    expect(screen.queryByTestId('harness-provider-endpoint')).toBeNull();
  });

  it('shows endpoint, model and key-variable fields for an open-source provider', () => {
    render(
      <HarnessSettingsSection
        harness={{
          decisions: {
            providers: [
              {
                id: 'context',
                kind: DecisionProviderKind.OpenAiCompatible,
                endpoint: 'http://localhost:11434/v1',
              },
            ],
            routes: { chunkVisibility: 'context' },
            defaultProviderId: 'deterministic',
            fallbackProviderIds: [],
          },
        }}
      />
    );
    expect((screen.getByTestId('harness-provider-endpoint') as HTMLInputElement).value).toBe(
      'http://localhost:11434/v1'
    );
    expect(screen.getByTestId('harness-provider-key')).toBeDefined();
  });

  it('routes chunk visibility to the provider when its endpoint is saved', async () => {
    render(
      <HarnessSettingsSection
        harness={{
          decisions: {
            providers: [{ id: 'context', kind: DecisionProviderKind.Jev }],
            routes: { chunkVisibility: 'context' },
            defaultProviderId: 'deterministic',
            fallbackProviderIds: [],
          },
        }}
      />
    );
    const endpoint = screen.getByTestId('harness-provider-endpoint');
    fireEvent.change(endpoint, { target: { value: 'https://jev.example' } });
    fireEvent.blur(endpoint);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const saved = mockUpdate.mock.calls[0][0].harness;
    expect(saved.decisions.providers).toEqual([
      { id: 'context', kind: DecisionProviderKind.Jev, endpoint: 'https://jev.example' },
    ]);
    expect(saved.decisions.routes.chunkVisibility).toBe('context');
  });

  it('saves the turn limit on blur and ignores invalid values', async () => {
    render(<HarnessSettingsSection />);
    const input = screen.getByTestId('harness-max-turns') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.blur(input);
    expect(input.value).toBe('50');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.blur(input);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][0].harness.maxTurns).toBe(20);
  });

  it('toggles a shadow mode', async () => {
    render(<HarnessSettingsSection />);
    fireEvent.click(screen.getByTestId('harness-shadow-contextRouter'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][0].harness.shadow.contextRouter).toBe(true);
  });
});
