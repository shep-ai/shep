import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureFlagsSettingsSection } from '@/components/features/settings/feature-flags-settings-section';

const mockUpdateSettingsAction = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const defaultFlags = {
  skills: false,
  envDeploy: false,
  debug: false,
  githubImport: false,
  adoptBranch: false,
  gitRebaseSync: false,
  reactFileManager: false,
  coastsDevServer: false,
};

describe('FeatureFlagsSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
  });

  it('renders 6 feature flag toggles with descriptions', () => {
    render(<FeatureFlagsSettingsSection featureFlags={defaultFlags} />);
    expect(screen.getByTestId('switch-flag-skills')).toBeDefined();
    expect(screen.getByTestId('switch-flag-envDeploy')).toBeDefined();
    expect(screen.getByTestId('switch-flag-debug')).toBeDefined();
    expect(screen.getByTestId('switch-flag-githubImport')).toBeDefined();
    expect(screen.getByTestId('switch-flag-adoptBranch')).toBeDefined();
    expect(screen.getByTestId('switch-flag-gitRebaseSync')).toBeDefined();
    expect(screen.getByTestId('switch-flag-reactFileManager')).toBeDefined();
    expect(screen.getByText('Skills')).toBeDefined();
    expect(screen.getByText('Deployments')).toBeDefined();
    expect(screen.getByText('Debug')).toBeDefined();
    expect(screen.getByText('GitHub Import')).toBeDefined();
    expect(screen.getByText('Adopt Branch')).toBeDefined();
    expect(screen.getByText('Git Rebase & Sync')).toBeDefined();
    expect(screen.getByText('React File Manager')).toBeDefined();
  });

  it('renders description text for each flag', () => {
    render(<FeatureFlagsSettingsSection featureFlags={defaultFlags} />);
    expect(
      screen.getByText('Enable Skills navigation and functionality in the web UI')
    ).toBeDefined();
    expect(screen.getByText('Enable environment deployment features in the web UI')).toBeDefined();
    expect(
      screen.getByText('Enable debug UI elements and verbose client-side logging')
    ).toBeDefined();
    expect(screen.getByText('Enable GitHub repository import in the web UI')).toBeDefined();
    expect(
      screen.getByText('Enable the ability to adopt existing branches as tracked features')
    ).toBeDefined();
    expect(
      screen.getByText('Enable git rebase-on-main and sync-main operations in the web UI')
    ).toBeDefined();
    expect(
      screen.getByText(
        'Use the built-in React file manager instead of the native OS folder picker. Also serves as automatic fallback when the native picker is unavailable.'
      )
    ).toBeDefined();
  });

  it('does not render a save button (auto-saves on change)', () => {
    render(<FeatureFlagsSettingsSection featureFlags={defaultFlags} />);
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('renders title', () => {
    render(<FeatureFlagsSettingsSection featureFlags={defaultFlags} />);
    expect(screen.getByText('Feature Flags')).toBeDefined();
  });
});
