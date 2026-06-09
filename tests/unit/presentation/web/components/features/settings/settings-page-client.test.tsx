import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPageClient } from '@/components/features/settings/settings-page-client';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/actions/security', () => ({
  updateSecurityModeAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock IntersectionObserver for jsdom
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
);

describe('SettingsPageClient', () => {
  const settings = createDefaultSettings();

  it('renders heading text "Settings"', () => {
    render(
      <SettingsPageClient settings={settings} shepHome="/home/user/.shep" dbFileSize="2.4 MB" />
    );
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('renders all section components', () => {
    render(
      <SettingsPageClient settings={settings} shepHome="/home/user/.shep" dbFileSize="2.4 MB" />
    );
    expect(screen.getByTestId('agent-settings-section')).toBeDefined();
    expect(screen.getByTestId('environment-settings-section')).toBeDefined();
    expect(screen.getByTestId('workflow-settings-section')).toBeDefined();
    expect(screen.getByTestId('security-settings-section')).toBeDefined();
    expect(screen.getByTestId('notification-settings-section')).toBeDefined();
    expect(screen.getByTestId('feature-flags-settings-section')).toBeDefined();
    expect(screen.getByTestId('database-settings-section')).toBeDefined();
  });

  it('passes shepHome and dbFileSize to database section', () => {
    render(<SettingsPageClient settings={settings} shepHome="/opt/shep" dbFileSize="10.5 MB" />);
    expect(screen.getByTestId('shep-home-path').textContent).toBe('/opt/shep');
    expect(screen.getByTestId('db-file-size').textContent).toBe('10.5 MB');
  });

  it('handles missing featureFlags gracefully', () => {
    const settingsWithoutFlags = { ...settings, featureFlags: undefined };
    render(
      <SettingsPageClient
        settings={settingsWithoutFlags}
        shepHome="/home/user/.shep"
        dbFileSize="2.4 MB"
      />
    );
    expect(screen.getByTestId('feature-flags-settings-section')).toBeDefined();
  });

  it('renders terminal select in environment section', () => {
    render(
      <SettingsPageClient
        settings={settings}
        shepHome="/home/user/.shep"
        dbFileSize="2.4 MB"
        availableTerminals={[
          { id: 'system', name: 'System Terminal', available: true },
          { id: 'warp', name: 'Warp', available: true },
        ]}
      />
    );
    expect(screen.getByTestId('terminal-select')).toBeDefined();
  });

  it('renders shell select in environment section', () => {
    render(
      <SettingsPageClient settings={settings} shepHome="/home/user/.shep" dbFileSize="2.4 MB" />
    );
    expect(screen.getByTestId('shell-select')).toBeDefined();
  });

  it('renders PR blocked notification toggle', () => {
    render(
      <SettingsPageClient settings={settings} shepHome="/home/user/.shep" dbFileSize="2.4 MB" />
    );
    expect(screen.getByTestId('switch-event-prBlocked')).toBeDefined();
    expect(screen.getByText('PR blocked')).toBeDefined();
  });

  it('renders Merge review ready notification toggle', () => {
    render(
      <SettingsPageClient settings={settings} shepHome="/home/user/.shep" dbFileSize="2.4 MB" />
    );
    expect(screen.getByTestId('switch-event-mergeReviewReady')).toBeDefined();
    expect(screen.getByText('Merge review ready')).toBeDefined();
  });
});
