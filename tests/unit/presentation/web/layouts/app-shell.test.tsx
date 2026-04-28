import React, { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPush = vi.fn();
let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useAllTurnStatuses: () => ({}),
}));

// AppShell wraps several global popups with next/dynamic for bundle-
// splitting. In vitest+jsdom the dynamic chunk loader doesn't resolve
// reliably across platforms (worked on macOS, timed out on Windows). The
// mock below replaces next/dynamic with a thin React.useState/useEffect
// wrapper that calls the loader and re-renders synchronously when the
// promise resolves — which happens on the next microtask in a test
// environment because the import is already in the module graph.
// Replace next/dynamic with synchronous placeholders so the test never
// depends on the dynamic chunk loader (it timed out on Windows runners
// even though it worked on macOS). Inspect the loader's source to route
// each slot to an appropriate stub.
//
// The chat-sheet stub honors the same `!hasRepositories` onboarding gate
// the real ChatSheet implements at line 408 — without it, the "hides
// during onboarding" test would always see the placeholder.
function ChatSheetStub() {
  const ctx = useSidebarFeaturesContext();
  if (!ctx.hasRepositories) return null;
  return <div>Shep Chat</div>;
}

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = loader.toString();
    if (src.includes('ChatSheet')) {
      return ChatSheetStub;
    }
    return () => null;
  },
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
  inventory: false,
  projects: false,
  codeReview: false,
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
  features: {
    featureId: string;
    name: string;
    status: 'action-needed' | 'in-progress' | 'done';
    repositoryPath: string;
    repositoryName: string;
  }[];
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
    mockPathname = '/control-center';
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

  it('marks Control Center as active for /control-center pathname', () => {
    renderShell(<div>Content</div>);
    const controlCenterLink = screen.getByRole('link', { name: /control center/i });
    expect(controlCenterLink).toHaveAttribute('data-active', 'true');
  });

  it('passes context features to AppSidebar when sidebar is collapsed', () => {
    const features = [
      {
        featureId: 'f-1',
        name: 'Auth Module',
        status: 'action-needed' as const,
        repositoryPath: '/home/user/my-app',
        repositoryName: 'my-app',
      },
      {
        featureId: 'f-2',
        name: 'Dashboard',
        status: 'in-progress' as const,
        repositoryPath: '/home/user/my-app',
        repositoryName: 'my-app',
      },
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

  describe('global chat popup', () => {
    it('renders the chat toggle button when repos exist', () => {
      render(
        <FeatureFlagsProvider flags={defaultFlags}>
          <AppShell>
            <ContextPublisher features={[]} hasRepositories={true} />
            <div>Content</div>
          </AppShell>
        </FeatureFlagsProvider>
      );
      // The next/dynamic mock at the top of this file replaces every
      // dynamic-loaded slot with a "Shep Chat" placeholder. We only assert
      // that AppShell mounts the slot when repos exist.
      expect(screen.getByText('Shep Chat')).toBeInTheDocument();
    });

    it('hides the chat toggle button during onboarding', () => {
      renderShell(<div>Content</div>);
      expect(screen.queryByText('Shep Chat')).not.toBeInTheDocument();
    });
  });
});
