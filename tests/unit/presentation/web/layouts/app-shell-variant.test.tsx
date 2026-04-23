import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = '/applications';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useAllTurnStatuses: () => ({}),
}));

import { AppShell } from '@/components/layouts/app-shell';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import { useOptionalAgentEventsContext } from '@/hooks/agent-events-provider';

const defaultFlags = {
  skills: false,
  envDeploy: false,
  debug: false,
  githubImport: false,
  adoptBranch: false,
  gitRebaseSync: false,
  reactFileManager: false,
  inventory: false,
  projects: false,
};

/**
 * Test-only probe that reads the AgentEventsContext. If a provider is
 * mounted above it (which is what we're verifying), the context value
 * will be non-null and the probe renders a marker element.
 */
function AgentEventsProbe() {
  const ctx = useOptionalAgentEventsContext();
  return (
    <div data-testid="agent-events-probe" data-has-context={ctx !== null ? 'yes' : 'no'}>
      probe
    </div>
  );
}

describe('AppShell variant', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockPathname = '/applications';
  });

  describe("variant='full' (default)", () => {
    it('renders sidebar markup (data-sidebar attribute present)', () => {
      const { container } = render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell>
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );

      const sidebarEl = container.querySelector('[data-sidebar]');
      expect(sidebarEl).not.toBeNull();
    });

    it('renders children', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell>
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      expect(screen.getByTestId('child-marker')).toBeInTheDocument();
    });

    it('mounts AgentEventsProvider (probe reads non-null context)', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell>
            <AgentEventsProbe />
          </AppShell>
        </FeatureFlagsProvider>
      );
      const probe = screen.getByTestId('agent-events-probe');
      expect(probe.getAttribute('data-has-context')).toBe('yes');
    });
  });

  describe("variant='apps-only'", () => {
    it('renders WITHOUT sidebar markup', () => {
      const { container } = render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell variant="apps-only">
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      const sidebarEl = container.querySelector('[data-sidebar]');
      expect(sidebarEl).toBeNull();
    });

    it('renders WITHOUT the global chat FAB', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell variant="apps-only">
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      // GlobalChatPopup exposes a "Shep Chat" tooltip/label.
      expect(screen.queryByText('Shep Chat')).not.toBeInTheDocument();
    });

    it('renders WITHOUT the control-center canvas / global search dialog', () => {
      const { container } = render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell variant="apps-only">
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      // GlobalSearchDialog renders a Radix Dialog with role="dialog" when
      // open, but its trigger/placeholder remains in the DOM via a hidden
      // command palette input with placeholder text.
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
      // Canvas panels from control-center aren't rendered either.
      expect(container.querySelector('.react-flow')).toBeNull();
    });

    it('renders children', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell variant="apps-only">
            <div data-testid="child-marker">content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      expect(screen.getByTestId('child-marker')).toBeInTheDocument();
    });

    it('mounts AgentEventsProvider (probe reads non-null context)', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell variant="apps-only">
            <AgentEventsProbe />
          </AppShell>
        </FeatureFlagsProvider>
      );
      const probe = screen.getByTestId('agent-events-probe');
      expect(probe.getAttribute('data-has-context')).toBe('yes');
    });
  });
});
