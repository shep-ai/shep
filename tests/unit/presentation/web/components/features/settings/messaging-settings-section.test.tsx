import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessagingSettingsSection } from '@/components/features/settings/messaging-settings-section';
import { MessagingPlatform } from '@shepai/core/domain/generated/output';

const mockUpdateSettings = vi.fn();
const mockBeginPairing = vi.fn();
const mockConfirmPairing = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettings(...args),
}));

vi.mock('@/app/actions/messaging', () => ({
  beginMessagingPairingAction: (...args: unknown[]) => mockBeginPairing(...args),
  confirmMessagingPairingAction: (...args: unknown[]) => mockConfirmPairing(...args),
  disconnectMessagingAction: (...args: unknown[]) => mockDisconnect(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const disabledConfig = {
  enabled: false,
  debounceMs: 5000,
  chatBufferMs: 3000,
};

const enabledUnpairedConfig = {
  enabled: true,
  gatewayUrl: 'https://gateway.example.com',
  debounceMs: 5000,
  chatBufferMs: 3000,
  telegram: { enabled: false, paired: false },
  whatsapp: { enabled: false, paired: false },
};

const telegramPairedConfig = {
  enabled: true,
  gatewayUrl: 'https://gateway.example.com',
  debounceMs: 5000,
  chatBufferMs: 3000,
  telegram: { enabled: true, paired: true, chatId: '@alice' },
  whatsapp: { enabled: false, paired: false },
};

describe('MessagingSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettings.mockResolvedValue({ success: true });
    mockBeginPairing.mockResolvedValue({
      success: true,
      session: {
        platform: MessagingPlatform.Telegram,
        code: '123456',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        gatewayUrl: 'https://gateway.example.com',
        publicUrl: 'https://gateway.example.com/integrations/route-abc/tok-xyz',
        routeId: 'route-abc',
      },
    });
    mockConfirmPairing.mockResolvedValue({ success: true });
    mockDisconnect.mockResolvedValue({ success: true });
  });

  it('renders the enable toggle', () => {
    render(<MessagingSettingsSection messaging={disabledConfig} />);
    expect(screen.getByTestId('switch-messaging-enabled')).toBeDefined();
  });

  it('disables gateway input when messaging is off', () => {
    render(<MessagingSettingsSection messaging={disabledConfig} />);
    expect(screen.getByTestId('input-gateway-url')).toHaveProperty('disabled', true);
  });

  it('shows pair buttons for unpaired platforms when enabled', () => {
    render(<MessagingSettingsSection messaging={enabledUnpairedConfig} />);
    expect(screen.getByTestId('btn-telegram-pair')).toBeDefined();
    expect(screen.getByTestId('btn-whatsapp-pair')).toBeDefined();
  });

  it('shows disconnect button for paired platform', () => {
    render(<MessagingSettingsSection messaging={telegramPairedConfig} />);
    expect(screen.getByTestId('btn-telegram-disconnect')).toBeDefined();
    expect(screen.queryByTestId('btn-telegram-pair')).toBeNull();
  });

  it('opens pairing dialog and displays the code + public URL after clicking pair', async () => {
    render(<MessagingSettingsSection messaging={enabledUnpairedConfig} />);
    fireEvent.click(screen.getByTestId('btn-telegram-pair'));
    await waitFor(() => expect(mockBeginPairing).toHaveBeenCalledOnce());
    expect(screen.getByTestId('messaging-pairing-dialog')).toBeDefined();
    expect(screen.getByText('123456')).toBeDefined();
    expect(
      screen.getByText('https://gateway.example.com/integrations/route-abc/tok-xyz')
    ).toBeDefined();
    expect(screen.getByTestId('btn-copy-public-url')).toBeDefined();
  });

  it('calls confirm pairing with the entered chat id', async () => {
    render(<MessagingSettingsSection messaging={enabledUnpairedConfig} />);
    fireEvent.click(screen.getByTestId('btn-telegram-pair'));
    await waitFor(() => expect(screen.getByTestId('messaging-pairing-dialog')).toBeDefined());

    const input = screen.getByTestId('input-pairing-chat-id') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '@alice' } });
    fireEvent.click(screen.getByTestId('btn-confirm-pairing'));

    await waitFor(() =>
      expect(mockConfirmPairing).toHaveBeenCalledWith({
        platform: MessagingPlatform.Telegram,
        chatId: '@alice',
      })
    );
  });

  it('confirm button is disabled until a chat id is entered', async () => {
    render(<MessagingSettingsSection messaging={enabledUnpairedConfig} />);
    fireEvent.click(screen.getByTestId('btn-telegram-pair'));
    await waitFor(() => expect(screen.getByTestId('btn-confirm-pairing')).toBeDefined());
    expect(screen.getByTestId('btn-confirm-pairing')).toHaveProperty('disabled', true);
  });

  it('refuses to begin pairing when gateway URL is invalid', async () => {
    const invalid = { ...enabledUnpairedConfig, gatewayUrl: 'not a url' };
    render(<MessagingSettingsSection messaging={invalid} />);
    fireEvent.click(screen.getByTestId('btn-telegram-pair'));
    await waitFor(() => expect(mockBeginPairing).not.toHaveBeenCalled());
  });

  it('shows disconnect-all row when at least one platform is paired', () => {
    render(<MessagingSettingsSection messaging={telegramPairedConfig} />);
    expect(screen.getByTestId('btn-disconnect-all')).toBeDefined();
  });

  it('calls disconnect with no platform when disconnect-all is clicked', async () => {
    render(<MessagingSettingsSection messaging={telegramPairedConfig} />);
    fireEvent.click(screen.getByTestId('btn-disconnect-all'));
    await waitFor(() => expect(mockDisconnect).toHaveBeenCalledWith({ platform: undefined }));
  });
});
