import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockDiscover = vi.fn();
const mockImport = vi.fn();

vi.mock('@/app/actions/import-local-repositories', () => ({
  discoverImportCandidates: (...args: unknown[]) => mockDiscover(...args),
  importLocalRepositories: (...args: unknown[]) => mockImport(...args),
}));

import { BulkImportDialog } from '@/components/common/bulk-import-dialog/bulk-import-dialog';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'proj',
    path: '/code/proj',
    isGitRepository: true,
    alreadyTracked: false,
    previouslyRemoved: false,
    ...overrides,
  };
}

function renderDialog(onImportComplete = vi.fn()) {
  return render(
    <BulkImportDialog
      open
      onOpenChange={vi.fn()}
      directoryPath="/code"
      onImportComplete={onImportComplete}
    />
  );
}

describe('BulkImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscover.mockResolvedValue({ directoryPath: '/code', candidates: [] });
    mockImport.mockResolvedValue({ results: [], importedCount: 0, failedCount: 0 });
  });

  it('discovers candidates for the given directory on open', async () => {
    renderDialog();

    await waitFor(() => {
      expect(mockDiscover).toHaveBeenCalledWith({ directoryPath: '/code' });
    });
  });

  it('renders one row per candidate', async () => {
    mockDiscover.mockResolvedValue({
      directoryPath: '/code',
      candidates: [
        candidate({ name: 'alpha', path: '/code/alpha' }),
        candidate({ name: 'beta', path: '/code/beta' }),
      ],
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('candidate-row-alpha')).toBeInTheDocument();
      expect(screen.getByTestId('candidate-row-beta')).toBeInTheDocument();
    });
  });

  it('shows an error state when discovery fails', async () => {
    mockDiscover.mockResolvedValue({ error: 'permission denied' });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('bulk-import-error')).toHaveTextContent('permission denied');
    });
  });

  it('preselects untracked git repositories only', async () => {
    mockDiscover.mockResolvedValue({
      directoryPath: '/code',
      candidates: [
        candidate({ name: 'gitrepo', path: '/code/gitrepo', isGitRepository: true }),
        candidate({ name: 'plain', path: '/code/plain', isGitRepository: false }),
      ],
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('bulk-import-submit')).toBeEnabled();
    });

    await userEvent.click(screen.getByTestId('bulk-import-submit'));

    await waitFor(() => {
      expect(mockImport).toHaveBeenCalledWith({ paths: ['/code/gitrepo'] });
    });
  });

  it('disables submit when nothing is selectable', async () => {
    mockDiscover.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate({ name: 'tracked', alreadyTracked: true })],
    });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByTestId('bulk-import-submit')).toBeDisabled();
    });
  });

  it('reports the imported count on success', async () => {
    const onImportComplete = vi.fn();
    mockDiscover.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate({ name: 'alpha', path: '/code/alpha' })],
    });
    mockImport.mockResolvedValue({
      results: [{ path: '/code/alpha', imported: true }],
      importedCount: 1,
      failedCount: 0,
    });

    renderDialog(onImportComplete);

    await waitFor(() => expect(screen.getByTestId('bulk-import-submit')).toBeEnabled());
    await userEvent.click(screen.getByTestId('bulk-import-submit'));

    await waitFor(() => {
      expect(onImportComplete).toHaveBeenCalledWith(1);
    });
  });

  it('surfaces a per-path failure inline instead of reporting clean success', async () => {
    mockDiscover.mockResolvedValue({
      directoryPath: '/code',
      candidates: [candidate({ name: 'alpha', path: '/code/alpha' })],
    });
    mockImport.mockResolvedValue({
      results: [{ path: '/code/alpha', imported: false, error: 'permission denied' }],
      importedCount: 0,
      failedCount: 1,
    });

    renderDialog();

    await waitFor(() => expect(screen.getByTestId('bulk-import-submit')).toBeEnabled());
    await userEvent.click(screen.getByTestId('bulk-import-submit'));

    await waitFor(() => {
      expect(screen.getByText('permission denied')).toBeInTheDocument();
    });
  });

  it('shows an empty message when the folder has no subfolders', async () => {
    mockDiscover.mockResolvedValue({ directoryPath: '/code', candidates: [] });

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(/no subfolders found/i)).toBeInTheDocument();
    });
  });
});
