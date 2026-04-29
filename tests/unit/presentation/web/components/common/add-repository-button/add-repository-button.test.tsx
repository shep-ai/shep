import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPickFolder = vi.fn();
const mockImportGitHubRepository = vi.fn();
const mockListGitHubRepositories = vi.fn();

vi.mock('@/components/common/add-repository-button/pick-folder', () => ({
  pickFolder: (...args: unknown[]) => mockPickFolder(...args),
}));

vi.mock('@/app/actions/import-github-repository', () => ({
  importGitHubRepository: (...args: unknown[]) => mockImportGitHubRepository(...args),
}));

vi.mock('@/app/actions/list-github-repositories', () => ({
  listGitHubRepositories: (...args: unknown[]) => mockListGitHubRepositories(...args),
}));

// Mock the react-file-manager-dialog as a simple controlled dialog
vi.mock('@/components/common/react-file-manager-dialog', () => ({
  ReactFileManagerDialog: ({
    open,
    onSelect,
    onOpenChange,
  }: {
    open: boolean;
    onSelect: (path: string | null) => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="react-file-manager-dialog">
        <button data-testid="rfm-select" onClick={() => onSelect('/selected/path')}>
          Select
        </button>
        <button data-testid="rfm-cancel" onClick={() => onSelect(null)}>
          Cancel
        </button>
        <button data-testid="rfm-close" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    );
  },
}));

// Mock feature flags context
vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: vi.fn(() => ({
    envDeploy: true,
    debug: false,
    reactFileManager: false,
    projects: false,
    codeReview: false,
  })),
}));

import { AddRepositoryButton } from '@/components/common/add-repository-button';
import { useFeatureFlags } from '@/hooks/feature-flags-context';

const mockUseFeatureFlags = vi.mocked(useFeatureFlags);

describe('AddRepositoryButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGitHubRepositories.mockResolvedValue({ repos: [] });
    mockPickFolder.mockResolvedValue(null);
    mockUseFeatureFlags.mockReturnValue({
      envDeploy: true,
      debug: false,
      reactFileManager: false,
      projects: false,
      codeReview: false,
    });
  });

  it('renders button that opens popover on click', async () => {
    const user = userEvent.setup();
    render(<AddRepositoryButton />);

    const button = screen.getByTestId('add-repository-button');
    expect(button).toBeInTheDocument();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
    });
  });

  it('popover shows "Local folder" and "From GitHub" options', async () => {
    const user = userEvent.setup();
    render(<AddRepositoryButton />);

    await user.click(screen.getByTestId('add-repository-button'));

    await waitFor(() => {
      expect(screen.getByText('Local folder')).toBeInTheDocument();
      expect(screen.getByText('From GitHub')).toBeInTheDocument();
    });
  });

  it('"Local folder" calls pickFolder and onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    mockPickFolder.mockResolvedValue('/home/user/my-repo');

    render(<AddRepositoryButton onSelect={onSelect} />);

    await user.click(screen.getByTestId('add-repository-button'));
    await waitFor(() => {
      expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-repo-local-folder'));

    await waitFor(() => {
      expect(mockPickFolder).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('/home/user/my-repo');
    });
  });

  it('"From GitHub" opens GitHubImportDialog', async () => {
    const user = userEvent.setup();
    render(<AddRepositoryButton />);

    await user.click(screen.getByTestId('add-repository-button'));
    await waitFor(() => {
      expect(screen.getByTestId('add-repo-from-github')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-repo-from-github'));

    await waitFor(() => {
      expect(screen.getByText('Import from GitHub')).toBeInTheDocument();
    });
  });

  it('popover closes after selecting local folder', async () => {
    const user = userEvent.setup();
    mockPickFolder.mockResolvedValue(null);

    render(<AddRepositoryButton />);

    await user.click(screen.getByTestId('add-repository-button'));
    await waitFor(() => {
      expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('add-repo-local-folder'));

    await waitFor(() => {
      expect(screen.queryByTestId('add-repo-local-folder')).not.toBeInTheDocument();
    });
  });

  describe('feature flag reactFileManager OFF (native picker with fallback)', () => {
    beforeEach(() => {
      mockUseFeatureFlags.mockReturnValue({
        envDeploy: true,
        debug: false,
        reactFileManager: false,
        projects: false,
        codeReview: false,
      });
    });

    it('calls native pickFolder when local folder is clicked', async () => {
      mockPickFolder.mockResolvedValue('/some/path');
      const user = userEvent.setup();
      render(<AddRepositoryButton />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(mockPickFolder).toHaveBeenCalledTimes(1);
      });
    });

    it('calls onSelect with path when native picker succeeds', async () => {
      mockPickFolder.mockResolvedValue('/some/path');
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<AddRepositoryButton onSelect={onSelect} />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledWith('/some/path');
      });
    });

    it('does not trigger fallback when native picker is cancelled (null)', async () => {
      mockPickFolder.mockResolvedValue(null);
      const user = userEvent.setup();
      render(<AddRepositoryButton />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(mockPickFolder).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId('react-file-manager-dialog')).not.toBeInTheDocument();
    });

    it('opens React file manager dialog as fallback when native picker throws', async () => {
      mockPickFolder.mockRejectedValue(new Error('zenity not found'));
      const user = userEvent.setup();
      render(<AddRepositoryButton />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });
    });

    it('calls onSelect when folder is selected in fallback dialog', async () => {
      mockPickFolder.mockRejectedValue(new Error('zenity not found'));
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<AddRepositoryButton onSelect={onSelect} />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('rfm-select'));
      expect(onSelect).toHaveBeenCalledWith('/selected/path');
    });

    it('closes dialog without calling onSelect when fallback dialog is cancelled', async () => {
      mockPickFolder.mockRejectedValue(new Error('zenity not found'));
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<AddRepositoryButton onSelect={onSelect} />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('rfm-cancel'));
      expect(onSelect).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByTestId('react-file-manager-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('feature flag reactFileManager ON (direct React picker)', () => {
    beforeEach(() => {
      mockUseFeatureFlags.mockReturnValue({
        envDeploy: true,
        debug: false,
        reactFileManager: true,
        projects: false,
        codeReview: false,
      });
    });

    it('opens React file manager dialog directly without calling native picker', async () => {
      const user = userEvent.setup();
      render(<AddRepositoryButton />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });
      expect(mockPickFolder).not.toHaveBeenCalled();
    });

    it('calls onSelect with path when folder is selected in direct dialog', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<AddRepositoryButton onSelect={onSelect} />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('rfm-select'));
      expect(onSelect).toHaveBeenCalledWith('/selected/path');
    });

    it('does not call onSelect when dialog is cancelled', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(<AddRepositoryButton onSelect={onSelect} />);

      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));

      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('rfm-cancel'));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('dialog state management', () => {
    it('resets showReactPicker when dialog closes', async () => {
      mockUseFeatureFlags.mockReturnValue({
        envDeploy: true,
        debug: false,
        reactFileManager: true,
        projects: false,
        codeReview: false,
      });
      const user = userEvent.setup();
      render(<AddRepositoryButton />);

      // Open the popover and click local folder to open the dialog
      await user.click(screen.getByTestId('add-repository-button'));
      await waitFor(() => {
        expect(screen.getByTestId('add-repo-local-folder')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('add-repo-local-folder'));
      await waitFor(() => {
        expect(screen.getByTestId('react-file-manager-dialog')).toBeInTheDocument();
      });

      // Close the dialog
      await user.click(screen.getByTestId('rfm-close'));
      await waitFor(() => {
        expect(screen.queryByTestId('react-file-manager-dialog')).not.toBeInTheDocument();
      });
    });
  });
});
