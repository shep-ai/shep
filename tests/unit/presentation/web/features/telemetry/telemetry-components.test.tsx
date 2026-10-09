import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingStep, TelemetryDisabledReason } from '@shepai/core/domain/generated/output';

const { mockGetStatus, mockSetPreferences, mockRecordStep } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockSetPreferences: vi.fn(),
  mockRecordStep: vi.fn(async () => undefined),
}));

vi.mock('@/app/actions/telemetry', () => ({
  getTelemetryStatus: () => mockGetStatus(),
  setTelemetryPreferences: (input: unknown) => mockSetPreferences(input),
  recordOnboardingStep: (...args: unknown[]) => mockRecordStep(...(args as [])),
  recordWebAreaView: vi.fn(),
}));

import {
  TELEMETRY_NOTICE_DISMISSED_KEY,
  TelemetryNoticeCard,
  TelemetryPreferences,
  TelemetrySettingsSection,
} from '@/components/features/telemetry';

const ON = {
  enabled: true,
  reason: null,
  includeIdentity: true,
  contactConsent: false,
  queuedEvents: 4,
  configured: true,
  destination: 'https://eu.i.posthog.com/batch/',
};

describe('TelemetryPreferences', () => {
  it('reports each switch as its own preference change', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TelemetryPreferences status={ON} onChange={onChange} />);

    await user.click(screen.getByTestId('switch-telemetry-enabled'));
    await user.click(screen.getByTestId('switch-telemetry-identity'));
    await user.click(screen.getByTestId('switch-telemetry-contact'));

    expect(onChange.mock.calls).toEqual([
      [{ enabled: false }],
      [{ includeIdentity: false }],
      [{ contactConsent: true }],
    ]);
  });

  it('locks every switch and names the reason when the environment forces metrics off', () => {
    render(
      <TelemetryPreferences
        status={{ ...ON, enabled: false, reason: TelemetryDisabledReason.DoNotTrack }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('telemetry-preferences-forced-off')).toHaveTextContent(
      'DO_NOT_TRACK is set'
    );
    expect(screen.getByTestId('switch-telemetry-enabled')).toBeDisabled();
    expect(screen.getByTestId('switch-telemetry-identity')).toBeDisabled();
  });

  it('lets the user turn metrics back on after opting out', () => {
    render(
      <TelemetryPreferences
        status={{ ...ON, enabled: false, reason: TelemetryDisabledReason.UserOptOut }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('telemetry-preferences-forced-off')).toBeNull();
    expect(screen.getByTestId('switch-telemetry-enabled')).not.toBeDisabled();
  });
});

describe('TelemetrySettingsSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the status and lists exactly what is sent', async () => {
    mockGetStatus.mockResolvedValue(ON);
    render(<TelemetrySettingsSection />);

    expect(await screen.findByTestId('telemetry-settings-queued')).toHaveTextContent('4');
    expect(screen.getByTestId('telemetry-settings-destination')).toHaveTextContent(
      'https://eu.i.posthog.com/batch/'
    );
    for (const field of ['installId', 'agentAccountHash', 'githubUsername', 'githubOwners']) {
      expect(screen.getByTestId(`telemetry-field-${field}`)).toBeInTheDocument();
    }
  });

  it('says nothing is sent when no project key is configured', async () => {
    mockGetStatus.mockResolvedValue({ ...ON, configured: false });
    render(<TelemetrySettingsSection />);
    expect(await screen.findByTestId('telemetry-settings-destination')).toHaveTextContent(
      'nothing is sent'
    );
  });

  it('saves a change and shows the new status', async () => {
    mockGetStatus.mockResolvedValue(ON);
    mockSetPreferences.mockResolvedValue({ ok: true, status: { ...ON, includeIdentity: false } });
    const user = userEvent.setup();
    render(<TelemetrySettingsSection />);

    await user.click(await screen.findByTestId('switch-telemetry-identity'));
    expect(mockSetPreferences).toHaveBeenCalledWith({ includeIdentity: false });
    await waitFor(() =>
      expect(screen.getByTestId('switch-telemetry-identity')).toHaveAttribute(
        'data-state',
        'unchecked'
      )
    );
  });

  it('shows an error when the status cannot be loaded', async () => {
    mockGetStatus.mockResolvedValue(null);
    render(<TelemetrySettingsSection />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('TelemetryNoticeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The web test setup replaces localStorage with vi.fn() mocks.
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  it('shows the notice and records that it was shown', async () => {
    mockGetStatus.mockResolvedValue(ON);
    render(<TelemetryNoticeCard />);

    expect(await screen.findByTestId('telemetry-notice-card')).toBeInTheDocument();
    expect(mockRecordStep).toHaveBeenCalledWith(OnboardingStep.TelemetryNotice, false);
  });

  it('turns metrics off in one click and goes away', async () => {
    mockGetStatus.mockResolvedValue(ON);
    mockSetPreferences.mockResolvedValue({
      ok: true,
      status: { ...ON, enabled: false, reason: TelemetryDisabledReason.UserOptOut },
    });
    const user = userEvent.setup();
    render(<TelemetryNoticeCard />);

    await user.click(await screen.findByTestId('telemetry-notice-turn-off'));
    expect(mockSetPreferences).toHaveBeenCalledWith({ enabled: false });
    await waitFor(() => expect(screen.queryByTestId('telemetry-notice-card')).toBeNull());
    expect(localStorage.setItem).toHaveBeenCalledWith(
      TELEMETRY_NOTICE_DISMISSED_KEY,
      expect.any(String)
    );
  });

  it('is acknowledged with "Got it" and stays hidden afterwards', async () => {
    mockGetStatus.mockResolvedValue(ON);
    const user = userEvent.setup();
    const { unmount } = render(<TelemetryNoticeCard />);

    await user.click(await screen.findByTestId('telemetry-notice-dismiss'));
    expect(mockRecordStep).toHaveBeenCalledWith(OnboardingStep.TelemetryNotice, true);
    expect(screen.queryByTestId('telemetry-notice-card')).toBeNull();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      TELEMETRY_NOTICE_DISMISSED_KEY,
      expect.any(String)
    );
    unmount();

    vi.mocked(localStorage.getItem).mockReturnValue('2026-10-09T12:00:00.000Z');
    render(<TelemetryNoticeCard />);
    expect(screen.queryByTestId('telemetry-notice-card')).toBeNull();
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
  });

  it('stays hidden while metrics are off', async () => {
    mockGetStatus.mockResolvedValue({ ...ON, enabled: false, reason: TelemetryDisabledReason.Ci });
    render(<TelemetryNoticeCard />);
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('telemetry-notice-card')).toBeNull();
  });
});
