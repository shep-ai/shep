import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicationsPageClient } from '@/components/features/applications/applications-page-client';
import { toast } from 'sonner';
import { adoptLocalDirectory } from '@/app/actions/adopt-local-directory';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/components/common/add-repository-button/pick-folder', () => ({
  pickFolder: vi.fn().mockResolvedValue('/projects/demo'),
}));
vi.mock('@/app/actions/adopt-local-directory', () => ({
  adoptLocalDirectory: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/app/actions/list-deployments', () => ({
  listDeployments: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/hooks/deployment-status-provider', () => ({
  DeploymentStatusProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/components/features/control-center/control-center-empty-state', () => ({
  ControlCenterEmptyState: (props: { initialMode?: string; onRepositorySelect?: unknown }) =>
    React.createElement('div', {
      'data-testid': 'empty-state-stub',
      'data-initial-mode': props.initialMode,
      'data-can-start-features': String(Boolean(props.onRepositorySelect)),
    }),
}));

vi.mock('@/components/features/applications/application-card', () => ({
  ApplicationCard: ({ application }: { application: { id: string } }) =>
    React.createElement('div', { 'data-testid': `application-card-${application.id}` }),
}));

function renderWithClient(props: React.ComponentProps<typeof ApplicationsPageClient> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ApplicationsPageClient, props)
    )
  );
}

describe('ApplicationsPageClient auto-refresh', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls /api/applications on an interval instead of fetching only once', async () => {
    vi.useFakeTimers();

    renderWithClient();

    // Flush the microtask queue so the initial queryFn promise resolves
    // under fake timers (testing-library's `waitFor` polls via a real
    // setInterval, which fake timers would otherwise stall).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterMount = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/applications'
    ).length;
    expect(callsAfterMount).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    const callsAfterInterval = fetchSpy.mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/applications'
    ).length;
    expect(callsAfterInterval).toBeGreaterThan(callsAfterMount);
  });

  it('still renders the empty state while data is stale-free on first load', async () => {
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('empty-state-stub')).toBeInTheDocument());
  });
});

describe('Applications workspace discovery and recovery', () => {
  const apps = [
    {
      id: 'weather',
      name: 'Weather Dashboard',
      description: 'Forecasts',
      repositoryPath: '/projects/weather',
      effectiveStatus: 'ready',
      createdAt: '2026-09-20',
    },
    {
      id: 'tasks',
      name: 'Task Manager',
      description: 'Team collaboration',
      repositoryPath: '/projects/tasks',
      effectiveStatus: 'building',
      createdAt: '2026-09-19',
    },
    {
      id: 'store',
      name: 'Online Store',
      description: 'Payments',
      repositoryPath: '/projects/store',
      effectiveStatus: 'failed',
      createdAt: '2026-09-18',
    },
    {
      id: 'blog',
      name: 'Personal Blog',
      description: 'Articles',
      repositoryPath: '/projects/blog',
      effectiveStatus: 'interrupted',
      createdAt: '2026-09-17',
    },
  ];

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => apps,
    } as Response);
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('searches names, descriptions and repository paths without case sensitivity', async () => {
    renderWithClient();
    const search = await screen.findByRole('searchbox', { name: 'Search applications' });
    await userEvent.type(search, '  TEAM  ');
    expect(screen.getByTestId('application-card-tasks')).toBeInTheDocument();
    expect(screen.queryByTestId('application-card-weather')).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, '/projects/weather');
    expect(screen.getByTestId('application-card-weather')).toBeInTheDocument();
    expect(screen.queryByTestId('application-card-tasks')).not.toBeInTheDocument();
  });

  it('combines status filtering with search and can clear an empty result', async () => {
    renderWithClient();
    const search = await screen.findByRole('searchbox', { name: 'Search applications' });
    await userEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByTestId('application-card-store')).toBeInTheDocument();
    expect(screen.getByTestId('application-card-blog')).toBeInTheDocument();
    expect(screen.queryByTestId('application-card-tasks')).not.toBeInTheDocument();
    await userEvent.type(search, 'Weather');
    expect(screen.getByText('No matching applications')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-stub')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByTestId('application-card-weather')).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it('announces loading while the first request is pending', () => {
    vi.mocked(globalThis.fetch).mockReturnValue(new Promise(() => undefined));
    renderWithClient();
    expect(screen.getByRole('status')).toHaveTextContent('Loading applications');
  });

  it('surfaces a local import failure', async () => {
    vi.mocked(adoptLocalDirectory).mockResolvedValue({ error: 'Directory unavailable' });
    renderWithClient();
    await userEvent.click(await screen.findByRole('button', { name: /Open local project/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not open project', {
        description: 'Directory unavailable',
      })
    );
  });
});

/**
 * A failed /api/applications call used to be indistinguishable from
 * "this user has no applications": the query's `error` was never read, so
 * `applications` fell back to `[]` and the FIRST-RUN WIZARD took over the
 * page — re-appearing every 15s as the poll kept failing.
 */
describe('ApplicationsPageClient query failure', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/applications') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows an error state with retry and NEVER the first-run wizard', async () => {
    renderWithClient();

    await waitFor(() => expect(screen.getByTestId('applications-error')).toBeInTheDocument());
    expect(screen.queryByTestId('empty-state-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('applications-retry')).toBeInTheDocument();
  });

  it('retries the fetch when the retry action is used', async () => {
    renderWithClient();

    const retry = await screen.findByTestId('applications-retry');
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === '/api/applications'
    ).length;

    await userEvent.click(retry);

    await waitFor(() => {
      const after = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === '/api/applications'
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });

  it('keeps showing the apps it already has when a later poll fails', async () => {
    let ok = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/applications') {
        return ok
          ? Promise.resolve({
              ok: true,
              json: async () => [{ id: 'app-1', createdAt: new Date().toISOString() }],
            } as Response)
          : Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => [] } as Response);
    });
    // The failing poll is the 15s `refetchInterval`; drive it with fake
    // timers rather than waiting on the wall clock.
    vi.useFakeTimers();

    renderWithClient();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId('application-card-app-1')).toBeInTheDocument();

    ok = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // One more flush: the rejected fetch settles a microtask after the
    // interval fires, and react-query commits the error on the tick after.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // The list the user already had must survive a failed refresh, and the
    // wizard must still never appear.
    expect(screen.getByTestId('applications-stale-warning')).toBeInTheDocument();
    expect(screen.getByTestId('application-card-app-1')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state-stub')).not.toBeInTheDocument();
  });
});

describe('App Builder framing (issue 896)', () => {
  const apps = [
    {
      id: 'weather',
      name: 'Weather Dashboard',
      description: 'Forecasts',
      repositoryPath: '/projects/weather',
      effectiveStatus: 'ready',
      createdAt: '2026-09-20',
    },
  ];

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => apps,
    } as Response);
  });

  afterEach(() => vi.restoreAllMocks());

  it('names the page the App Builder and states its stack and missing spec phase', async () => {
    renderWithClient();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'App Builder' })
    ).toBeInTheDocument();
    const intro = screen.getByTestId('app-builder-intro');
    expect(intro).toHaveTextContent('Vite + React + Tailwind + shadcn');
    expect(intro).toHaveTextContent(/no spec phase/i);
  });

  it('opens the App Builder prompt in Quick web app mode', async () => {
    renderWithClient({ specDrivenAvailable: true });

    await userEvent.click(await screen.findByRole('button', { name: /New web app/ }));

    expect(screen.getByTestId('empty-state-stub')).toHaveAttribute(
      'data-initial-mode',
      'application'
    );
  });

  it('points spec-driven users to an any-stack project', async () => {
    renderWithClient({ specDrivenAvailable: true });

    await userEvent.click(
      await screen.findByRole('button', { name: /Start a spec-driven project/ })
    );

    const composer = screen.getByTestId('empty-state-stub');
    expect(composer).toHaveAttribute('data-initial-mode', 'spec');
    expect(composer).toHaveAttribute('data-can-start-features', 'true');
  });

  it('offers no spec-driven hand-off where Features are unavailable (apps-only shell)', async () => {
    renderWithClient({ specDrivenAvailable: false });

    await screen.findByTestId('applications-page-grid');
    expect(screen.queryByRole('button', { name: /spec-driven/i })).not.toBeInTheDocument();
  });
});
