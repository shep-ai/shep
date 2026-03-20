import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

import { AppShell } from '@/components/layouts/app-shell';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import { useSidebarFeaturesContext } from '@/hooks/sidebar-features-context';

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

function renderShell(children: React.ReactNode) {
  return render(
    <FeatureFlagsProvider flags={defaultFlags}>
      <AppShell>{children}</AppShell>
    </FeatureFlagsProvider>
  );
}

/**
 * A child component that publishes features into the SidebarFeaturesContext.
 * This simulates what ControlCenterInner does in production — it writes
 * sidebar features into the context so AppShellInner can pass them to AppSidebar.
 */
function ContextPublisher({
  features,
  hasRepositories = false,
}: {
  features: { featureId: string; name: string; status: 'action-needed' | 'in-progress' | 'done' }[];
  hasRepositories?: boolean;
}) {
  const { setFeatures, setHasRepositories } = useSidebarFeaturesContext();
  useEffect(() => {
    setFeatures(features);
    setHasRepositories(hasRepositories);
  }, [features, hasRepositories, setFeatures, setHasRepositories]);
  return null;
}

describe('AppShell', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPathname = '/';
  });

  it('renders children within the dashboard layout', () => {
    renderShell(<div>Test content</div>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders sidebar with Control Center and Tools nav items', () => {
    renderShell(<div>Content</div>);
    expect(screen.getByText('Control Center')).toBeInTheDocument();
    expect(screen.getByText('Tools')).toBeInTheDocument();
  });

  it('sidebar is collapsed by default (logo text hidden)', () => {
    renderShell(<div>Content</div>);
    // When collapsed, the Shep text label is not rendered
    expect(screen.queryByText('Shep')).not.toBeInTheDocument();
  });

  it('renders Settings link in sidebar footer', () => {
    const { container } = renderShell(<div>Content</div>);
    const settingsLink = container.querySelector('a[href="/settings"]');
    expect(settingsLink).toBeInTheDocument();
  });

  it('marks Control Center as active for / pathname', () => {
    renderShell(<div>Content</div>);
    const controlCenterLink = screen.getByRole('link', { name: /control center/i });
    expect(controlCenterLink).toHaveAttribute('data-active', 'true');
  });

  it('passes context features to AppSidebar when sidebar is collapsed', () => {
    const features = [
      { featureId: 'f-1', name: 'Auth Module', status: 'action-needed' as const },
      { featureId: 'f-2', name: 'Dashboard', status: 'in-progress' as const },
    ];

    renderShell(<ContextPublisher features={features} />);

    // When collapsed, feature names are hidden but the sidebar data-testid exists
    const sidebar = screen.getByTestId('app-sidebar');
    expect(sidebar).toBeInTheDocument();
  });

  it('renders sidebar nav items even when collapsed', () => {
    renderShell(<div>Content</div>);
    // Nav items use icons + links which are still accessible when collapsed
    expect(screen.getByRole('link', { name: /control center/i })).toBeInTheDocument();
  });

  describe('FAB visibility by route', () => {
    it.each([
      ['/', 'root'],
      ['/create', 'create feature'],
      ['/feature/abc-123', 'feature detail'],
      ['/feature/abc-123/activity', 'feature tab'],
      ['/repository/repo-1', 'repository detail'],
    ])('renders the FAB on control center route %s (%s) when repositories exist', (pathname) => {
      mockPathname = pathname;
      // FAB shows when there are repositories (hidden only during onboarding)
      renderShell(
        <>
          <ContextPublisher
            features={[{ featureId: 'f1', name: 'Test', status: 'in-progress' }]}
            hasRepositories
          />
          <div>Content</div>
        </>
      );
      expect(screen.getByTestId('fab-trigger')).toBeInTheDocument();
    });

    it('hides the FAB on control center route when no repositories exist (onboarding)', () => {
      mockPathname = '/';
      renderShell(<div>Content</div>);
      expect(screen.queryByTestId('fab-trigger')).not.toBeInTheDocument();
    });

    it.each([
      ['/settings', 'settings page'],
      ['/skills', 'skills page'],
      ['/tools', 'tools page'],
      ['/version', 'version page'],
    ])('does not render the FAB on non-control-center route %s (%s)', (pathname) => {
      mockPathname = pathname;
      renderShell(<div>Content</div>);
      expect(screen.queryByTestId('fab-trigger')).not.toBeInTheDocument();
    });
  });
});
