/**
 * Crashed global overlays in the app shell.
 *
 * The shell mounts six always-present overlay widgets (chat popup, Cmd+K
 * search, GitHub import, two file pickers, bulk import) inside
 * ErrorBoundaries. When one throws, two things must be true at once:
 *
 *  1. it keeps occupying ZERO layout space — it renders nothing when
 *     healthy, so a 200px error card in its place is a worse bug; and
 *  2. the user is TOLD. A crashed GlobalSearchDialog means Cmd+K silently
 *     does nothing forever, which is how this went unnoticed.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/control-center',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
}));

function Exploding(): React.ReactElement {
  throw new Error('search index unavailable');
}

// Route only the global-search slot to a component that throws; every
// other dynamic slot renders nothing, as in the sibling app-shell tests.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = loader.toString();
    if (src.includes('global-search-dialog')) return Exploding;
    return () => null;
  },
}));

import { AppShell } from '@/components/layouts/app-shell';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';

const defaultFlags = {
  envDeploy: false,
  debug: false,
  reactFileManager: false,
  projects: false,
  codeReview: false,
  collaboration: false,
  bedrockIntegration: false,
  whatsappDispatch: false,
  aspm: false,
  clusters: false,
  scheduledWorkflows: false,
  githubImport: true,
  queryAwareHarness: false,
};

function renderShell() {
  return render(
    <FeatureFlagsProvider flags={defaultFlags}>
      <AppShell>
        <div>Test content</div>
      </AppShell>
    </FeatureFlagsProvider>
  );
}

describe('AppShell global overlay crashes', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps the rest of the shell usable and injects no error card into the layout', () => {
    renderShell();

    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('tells the user which surface died instead of failing silently', () => {
    renderShell();

    expect(toastError).toHaveBeenCalledTimes(1);
    const [message] = toastError.mock.calls[0] as [string, ...unknown[]];
    expect(message.toLowerCase()).toContain('search');
    consoleError.mockRestore();
  });

  it('does not re-toast the same crash on every re-render', () => {
    const { rerender } = renderShell();
    rerender(
      <FeatureFlagsProvider flags={defaultFlags}>
        <AppShell>
          <div>Test content</div>
        </AppShell>
      </FeatureFlagsProvider>
    );

    expect(toastError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
