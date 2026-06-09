import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationSettingsSection } from '@/components/features/settings/notification-settings-section';

const mockUpdateSettingsAction = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const defaultNotifications = {
  inApp: { enabled: true },
  browser: { enabled: true },
  desktop: { enabled: false },
  events: {
    agentStarted: true,
    phaseCompleted: true,
    waitingApproval: true,
    agentCompleted: true,
    agentFailed: true,
    mergeReviewReady: true,
    prMerged: true,
    prClosed: true,
    prChecksPassed: true,
    prChecksFailed: true,
    prBlocked: true,
    workflowStarted: true,
    workflowCompleted: true,
    workflowFailed: true,
  },
};

describe('NotificationSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
  });

  it('renders in-app channel toggle', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.getByTestId('switch-in-app')).toBeDefined();
    expect(screen.getByText('In-App')).toBeDefined();
  });

  it('does not render unimplemented browser and desktop toggles', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.queryByTestId('switch-browser')).toBeNull();
    expect(screen.queryByTestId('switch-desktop')).toBeNull();
  });

  it('renders 11 event type toggles', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.getByTestId('switch-event-agentStarted')).toBeDefined();
    expect(screen.getByTestId('switch-event-phaseCompleted')).toBeDefined();
    expect(screen.getByTestId('switch-event-waitingApproval')).toBeDefined();
    expect(screen.getByTestId('switch-event-agentCompleted')).toBeDefined();
    expect(screen.getByTestId('switch-event-agentFailed')).toBeDefined();
    expect(screen.getByTestId('switch-event-mergeReviewReady')).toBeDefined();
    expect(screen.getByTestId('switch-event-prMerged')).toBeDefined();
    expect(screen.getByTestId('switch-event-prClosed')).toBeDefined();
    expect(screen.getByTestId('switch-event-prChecksPassed')).toBeDefined();
    expect(screen.getByTestId('switch-event-prChecksFailed')).toBeDefined();
    expect(screen.getByTestId('switch-event-prBlocked')).toBeDefined();
  });

  it('renders event type labels', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.getByText('Agent Started')).toBeDefined();
    expect(screen.getByText('Phase Completed')).toBeDefined();
    expect(screen.getByText('Waiting Approval')).toBeDefined();
    expect(screen.getByText('Agent Completed')).toBeDefined();
    expect(screen.getByText('Agent Failed')).toBeDefined();
    expect(screen.getByText('Merge Review Ready')).toBeDefined();
    expect(screen.getByText('PR Merged')).toBeDefined();
    expect(screen.getByText('PR Closed')).toBeDefined();
    expect(screen.getByText('PR Checks Passed')).toBeDefined();
    expect(screen.getByText('PR Checks Failed')).toBeDefined();
    expect(screen.getByText('PR Blocked')).toBeDefined();
  });

  it('groups events under agent events and pr events headings', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.getByText('Agent Events')).toBeDefined();
    expect(screen.getByText('PR Events')).toBeDefined();
  });

  it('does not render a save button (auto-saves on change)', () => {
    render(<NotificationSettingsSection notifications={defaultNotifications} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
