import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockDeleteRepository = vi.fn();
const mockOpenIde = vi.fn();
const mockOpenShell = vi.fn();
const mockOpenFolder = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: mockRefresh, prefetch: vi.fn() }),
  usePathname: () => '/control-center',
}));

vi.mock('@/app/actions/delete-repository', () => ({
  deleteRepository: (...a: unknown[]) => mockDeleteRepository(...a),
}));
vi.mock('@/app/actions/open-ide', () => ({ openIde: (...a: unknown[]) => mockOpenIde(...a) }));
vi.mock('@/app/actions/open-shell', () => ({
  openShell: (...a: unknown[]) => mockOpenShell(...a),
}));
vi.mock('@/app/actions/open-folder', () => ({
  openFolder: (...a: unknown[]) => mockOpenFolder(...a),
}));
vi.mock('@/app/actions/sync-repository', () => ({ syncRepository: vi.fn() }));

import { SessionTreeRepositoryActions } from '@/components/features/session-tree/session-tree-repository-actions';

const repository = {
  id: 'repo-1',
  name: 'proj',
  path: '/code/proj',
  features: [],
  unadoptedSessions: [],
  sessionCount: 0,
};

/** Open the row's action menu and wait for it to be on screen. */
async function openMenu() {
  await userEvent.click(screen.getByTestId('session-tree-repository-actions-/code/proj'));
  await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
}

describe('SessionTreeRepositoryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteRepository.mockResolvedValue({ success: true });
    mockOpenIde.mockResolvedValue({ success: true });
    mockOpenShell.mockResolvedValue({ success: true });
    mockOpenFolder.mockResolvedValue({ success: true });
    // The webhook hook probes two endpoints on mount.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ connected: false }) })
    );
  });

  it('probes nothing until the menu is opened', async () => {
    // The tree renders one of these per repository, so mounting the action
    // state eagerly would fire a webhook probe per row on every tree load.
    render(<SessionTreeRepositoryActions repository={repository} />);

    await waitFor(() =>
      expect(screen.getByTestId('session-tree-repository-actions-/code/proj')).toBeInTheDocument()
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await openMenu();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it('offers the same repository actions the canvas card offers', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();

    const menu = screen.getByRole('menu');
    for (const label of [
      /open repository/i,
      /new feature/i,
      /chat/i,
      /open in ide/i,
      /open in (shell|terminal)/i,
      /open folder/i,
      /webhook/i,
      /dev server/i,
      /remove repository/i,
    ]) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
    expect(menu).toBeInTheDocument();
  });

  it('navigates to the repository drawer', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /open repository/i }));

    expect(mockPush).toHaveBeenCalledWith('/repository/repo-1');
  });

  it('opens the create-feature route scoped to this repository', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /new feature/i }));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/create'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('/code/proj'))
    );
  });

  it('navigates to the repository chat', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /chat/i }));

    expect(mockPush).toHaveBeenCalledWith('/repository/repo-1/chat');
  });

  it('opens the repository in the IDE', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /open in ide/i }));

    await waitFor(() => expect(mockOpenIde).toHaveBeenCalledWith({ repositoryPath: '/code/proj' }));
  });

  it('confirms before removing the repository, then reloads the tree', async () => {
    const onChanged = vi.fn();
    render(<SessionTreeRepositoryActions repository={repository} onChanged={onChanged} />);
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /remove repository/i }));

    // Nothing is deleted until the dialog is confirmed.
    expect(mockDeleteRepository).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByTestId('repository-delete-confirm-button'));

    await waitFor(() =>
      expect(mockDeleteRepository).toHaveBeenCalledWith('repo-1', { deleteFromDisk: false })
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('passes the delete-from-disk choice through to the server action', async () => {
    render(<SessionTreeRepositoryActions repository={repository} />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /remove repository/i }));

    await userEvent.click(await screen.findByTestId('repository-delete-from-disk-checkbox'));
    await userEvent.click(screen.getByTestId('repository-delete-confirm-button'));

    await waitFor(() =>
      expect(mockDeleteRepository).toHaveBeenCalledWith('repo-1', { deleteFromDisk: true })
    );
  });

  it('surfaces a failed delete instead of silently closing', async () => {
    mockDeleteRepository.mockResolvedValue({ success: false, error: 'in use' });
    const onChanged = vi.fn();
    render(<SessionTreeRepositoryActions repository={repository} onChanged={onChanged} />);
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: /remove repository/i }));

    await userEvent.click(await screen.findByTestId('repository-delete-confirm-button'));

    expect(await screen.findByTestId('repository-delete-error')).toHaveTextContent('in use');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('renders nothing actionable for a repository with no id', async () => {
    render(<SessionTreeRepositoryActions repository={{ ...repository, id: undefined }} />);
    await openMenu();

    // Path-based actions still work; identity-based ones are not offered.
    expect(screen.getByRole('menuitem', { name: /open in ide/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /open repository/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /remove repository/i })).not.toBeInTheDocument();
  });
});
