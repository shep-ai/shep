import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockLoad = vi.fn();
const mockArchive = vi.fn();
const mockUnarchive = vi.fn();
const mockDelete = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
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

const treeWithAdopted = {
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

describe('SessionTreePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockResolvedValue({ repositories: [], archivedCount: 0 });
    mockArchive.mockResolvedValue({ ok: true });
    mockUnarchive.mockResolvedValue({ ok: true });
    mockDelete.mockResolvedValue({ ok: true, deleted: true });
  });

  it('loads the tree on mount, excluding archived by default', async () => {
    render(<SessionTreePanel />);

    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ includeArchived: false }));
  });

  it('renders repositories expanded by default', async () => {
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() => {
      expect(screen.getByTestId('session-tree-repo-proj')).toBeInTheDocument();
      // Expanded, so children are visible without interaction.
      expect(screen.getByTestId('session-tree-feature-feat-1')).toBeInTheDocument();
      expect(screen.getByTestId('session-tree-session-loose')).toBeInTheDocument();
    });
  });

  it('nests an adopted session under its feature and marks it adopted', async () => {
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() => {
      const adopted = screen.getByTestId('session-tree-session-a1');
      expect(adopted).toHaveAttribute('data-adopted', 'true');
    });
    expect(screen.getByTestId('session-tree-session-loose')).toHaveAttribute(
      'data-adopted',
      'false'
    );
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
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() => expect(screen.getByTestId('session-tree-toggle-archived')).toBeEnabled());
    await userEvent.click(screen.getByTestId('session-tree-toggle-archived'));

    await waitFor(() => expect(mockLoad).toHaveBeenCalledWith({ includeArchived: true }));
  });

  it('collapses a repository when its row is clicked', async () => {
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() =>
      expect(screen.getByTestId('session-tree-session-loose')).toBeInTheDocument()
    );
    await userEvent.click(screen.getByTestId('session-tree-repo-proj'));

    await waitFor(() =>
      expect(screen.queryByTestId('session-tree-session-loose')).not.toBeInTheDocument()
    );
  });

  it('archives a session in one click', async () => {
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() =>
      expect(screen.getByTestId('session-tree-actions-loose')).toBeInTheDocument()
    );
    await userEvent.click(screen.getByTestId('session-tree-actions-loose'));
    await userEvent.click(await screen.findByTestId('session-tree-archive-loose'));

    await waitFor(() =>
      expect(mockArchive).toHaveBeenCalledWith({ sessionId: 'loose', agentType: 'claude-code' })
    );
  });

  it('does not delete until the confirmation is accepted', async () => {
    mockLoad.mockResolvedValue(treeWithAdopted);
    render(<SessionTreePanel />);

    await waitFor(() =>
      expect(screen.getByTestId('session-tree-actions-loose')).toBeInTheDocument()
    );
    await userEvent.click(screen.getByTestId('session-tree-actions-loose'));
    await userEvent.click(await screen.findByTestId('session-tree-delete-loose'));

    // Dialog is open, but nothing deleted yet.
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
