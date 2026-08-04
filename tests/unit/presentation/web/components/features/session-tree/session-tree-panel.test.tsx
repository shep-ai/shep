import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockLoad = vi.fn();
const mockArchive = vi.fn();
const mockUnarchive = vi.fn();
const mockDelete = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/control-center',
}));

vi.mock('@/app/actions/session-tree', () => ({
  loadSessionTree: (...a: unknown[]) => mockLoad(...a),
  archiveSession: (...a: unknown[]) => mockArchive(...a),
  unarchiveSession: (...a: unknown[]) => mockUnarchive(...a),
  deleteSession: (...a: unknown[]) => mockDelete(...a),
}));

import { SessionTreePanel } from '@/components/features/session-tree/session-tree-panel';

function session(id: string, adopted = false, archived = false) {
  return {
    id,
    agentType: 'claude-code',
    preview: `preview ${id}`,
    messageCount: 3,
    lastMessageAt: '2026-08-03T00:00:00Z',
    filePath: `/transcripts/${id}.jsonl`,
    adopted,
    archived,
  };
}

const tree = {
  repositories: [
    {
      id: 'repo-1',
      name: 'proj',
      path: '/code/proj',
      features: [
        {
          id: 'feat-1',
          name: 'Billing',
          lifecycle: 'Requirements',
          sessions: [session('a1', true)],
        },
      ],
      unadoptedSessions: [session('loose')],
      sessionCount: 2,
    },
  ],
  archivedCount: 0,
};

/** Expand the "proj" repository and wait for its children. */
async function expandRepo() {
  await waitFor(() => expect(screen.getByTestId('session-tree-repo-proj')).toBeInTheDocument());
  await userEvent.click(screen.getByTestId('session-tree-repo-proj'));
  return screen.findByTestId('session-tree-session-loose');
}

describe('SessionTreePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The shared web setup stubs localStorage with non-storing mocks; the panel
    // persists expansion, so give each test a real in-memory store.
    const store = new Map<string, string>();
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(
      (k: string) => store.get(k) ?? null
    );
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      store.set(k, v);
    });

    mockLoad.mockResolvedValue({ repositories: [], archivedCount: 0 });
    mockArchive.mockResolvedValue({ ok: true });
    mockUnarchive.mockResolvedValue({ ok: true });
    mockDelete.mockResolvedValue({ ok: true, deleted: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the tree on mount, excluding archived by default', async () => {
    render(<SessionTreePanel />);

    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ includeArchived: false }));
  });

  it('renders repositories COLLAPSED by default', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);

    await waitFor(() => expect(screen.getByTestId('session-tree-repo-proj')).toBeInTheDocument());
    expect(screen.queryByTestId('session-tree-feature-feat-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('session-tree-session-loose')).not.toBeInTheDocument();
  });

  it('reveals children when a repository is expanded', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);

    await expandRepo();

    expect(screen.getByTestId('session-tree-feature-feat-1')).toBeInTheDocument();
  });

  it('collapses an expanded repository when clicked again', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await expandRepo();

    await userEvent.click(screen.getByTestId('session-tree-repo-proj'));

    await waitFor(() =>
      expect(screen.queryByTestId('session-tree-session-loose')).not.toBeInTheDocument()
    );
  });

  it('marks an adopted session as adopted and a loose one as not', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await expandRepo();

    // The disclosure control is a nested button inside the feature row.
    await userEvent.click(screen.getByRole('button', { name: /expand feature/i }));

    expect(await screen.findByTestId('session-tree-session-a1')).toHaveAttribute(
      'data-adopted',
      'true'
    );
    expect(screen.getByTestId('session-tree-session-loose')).toHaveAttribute(
      'data-adopted',
      'false'
    );
  });

  it('collapses everything via the collapse-all control', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await expandRepo();

    await userEvent.click(screen.getByTestId('session-tree-collapse-all'));

    await waitFor(() =>
      expect(screen.queryByTestId('session-tree-session-loose')).not.toBeInTheDocument()
    );
  });

  it('expands every repository when nothing is expanded', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await waitFor(() => expect(screen.getByTestId('session-tree-repo-proj')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('session-tree-collapse-all'));

    expect(await screen.findByTestId('session-tree-session-loose')).toBeInTheDocument();
  });

  it('persists expansion so it survives a remount', async () => {
    mockLoad.mockResolvedValue(tree);
    const first = render(<SessionTreePanel />);
    await expandRepo();

    first.unmount();
    render(<SessionTreePanel />);

    // Restored from storage — expanded with no interaction this time.
    expect(await screen.findByTestId('session-tree-session-loose')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is tracked', async () => {
    render(<SessionTreePanel />);

    await waitFor(() => expect(screen.getByTestId('session-tree-empty')).toBeInTheDocument());
  });

  it('shows an error state when loading fails', async () => {
    mockLoad.mockResolvedValue({ error: 'boom' });
    render(<SessionTreePanel />);

    await waitFor(() => expect(screen.getByTestId('session-tree-error')).toHaveTextContent('boom'));
  });

  it('reloads with archived included when toggled', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await waitFor(() => expect(screen.getByTestId('session-tree-toggle-archived')).toBeEnabled());

    await userEvent.click(screen.getByTestId('session-tree-toggle-archived'));

    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ includeArchived: true }));
  });

  it('archives a session in one click', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await expandRepo();

    await userEvent.click(screen.getByTestId('session-tree-actions-loose'));
    await userEvent.click(await screen.findByTestId('session-tree-archive-loose'));

    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith({ sessionId: 'loose', agentType: 'claude-code' })
    );
  });

  it('does not delete until the confirmation is accepted', async () => {
    mockLoad.mockResolvedValue(tree);
    render(<SessionTreePanel />);
    await expandRepo();

    await userEvent.click(screen.getByTestId('session-tree-actions-loose'));
    await userEvent.click(await screen.findByTestId('session-tree-delete-loose'));

    // Dialog open, nothing deleted yet.
    expect(mockDelete).not.toHaveBeenCalled();
    expect(await screen.findByTestId('session-tree-delete-path')).toHaveTextContent(
      '/transcripts/loose.jsonl'
    );

    await userEvent.click(screen.getByTestId('session-tree-delete-confirm'));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith({ sessionId: 'loose', agentType: 'claude-code' })
    );
  });
});
