import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepositoryNode } from '@/components/common/repository-node/repository-node';

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatuses: () => ({}),
}));
import type { RepositoryNodeData } from '@/components/common/repository-node/repository-node-config';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

// Mock @xyflow/react — RepositoryNode uses Handle and Position
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}-${position}`} />
  ),
  Position: { Left: 'left', Right: 'right' },
}));

// Mock the useRepositoryActions hook
const mockOpenInIde = vi.fn();
const mockOpenInShell = vi.fn();
const mockOpenFolder = vi.fn();
const mockSyncMain = vi.fn();
let mockHookReturn = {
  openInIde: mockOpenInIde,
  openInShell: mockOpenInShell,
  openFolder: mockOpenFolder,
  syncMain: mockSyncMain,
  ideLoading: false,
  shellLoading: false,
  folderLoading: false,
  syncLoading: false,
  ideError: null as string | null,
  shellError: null as string | null,
  folderError: null as string | null,
  syncError: null as string | null,
};

vi.mock('@/components/common/repository-node/use-repository-actions', () => ({
  useRepositoryActions: () => mockHookReturn,
}));

// Mock the useDeployAction hook
const mockDeploy = vi.fn();
const mockStop = vi.fn();
let mockDeployHookReturn = {
  deploy: mockDeploy,
  stop: mockStop,
  deployLoading: false,
  stopLoading: false,
  deployError: null as string | null,
  status: null as string | null,
  url: null as string | null,
};

vi.mock('@/hooks/use-deploy-action', () => ({
  useDeployAction: () => mockDeployHookReturn,
}));

// Mock FeatureSessionsDropdown — avoids pulling in radix-ui/dropdown-menu
vi.mock('@/components/common/feature-node/feature-sessions-dropdown', () => ({
  FeatureSessionsDropdown: () => <div data-testid="mock-sessions-dropdown" />,
}));

// Mock feature flags — enable envDeploy so deploy buttons render
vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: () => ({ envDeploy: true, skills: false, debug: false, githubImport: false }),
}));

// Mock radix-ui tooltip — render trigger children directly, hide content to avoid DOM noise
vi.mock('radix-ui', () => ({
  Tooltip: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: React.ReactNode; [key: string]: unknown }) => (
      <>{children}</>
    ),
    Content: ({ children }: { children: React.ReactNode }) => (
      <div role="tooltip" hidden>
        {children}
      </div>
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Arrow: () => null,
  },
  Slot: {
    Root: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  Label: {
    Root: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <label {...props}>{children}</label>
    ),
  },
  Checkbox: {
    Root: ({
      children,
      checked,
      onCheckedChange,
      ...props
    }: React.PropsWithChildren<{
      checked?: boolean;
      onCheckedChange?: (checked: boolean) => void;
      [key: string]: unknown;
    }>) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
        {...props}
      >
        {children}
      </button>
    ),
    Indicator: ({ children }: React.PropsWithChildren) => <>{children}</>,
  },
}));

// Mock shadcn Dialog — controlled by `open` prop, propagates close via onOpenChange
vi.mock('@/components/ui/dialog', () => {
  const DialogContext = React.createContext<((open: boolean) => void) | undefined>(undefined);
  return {
    Dialog: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) =>
      open ? (
        <DialogContext.Provider value={onOpenChange}>{children}</DialogContext.Provider>
      ) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div role="dialog">{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogClose: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => {
      const close = React.useContext(DialogContext);
      return React.cloneElement(children, {
        onClick: () => {
          children.props.onClick?.();
          close?.(false);
        },
      });
    },
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

const defaultData: RepositoryNodeData = {
  name: 'shep-ai/shep',
};

const dataWithRepoPath: RepositoryNodeData = {
  name: 'shep-ai/shep',
  repositoryPath: '/home/user/my-repo',
};

function renderNode(data: RepositoryNodeData = defaultData) {
  return render(<RepositoryNode data={data} />);
}

describe('RepositoryNode', () => {
  beforeEach(() => {
    mockOpenInIde.mockReset();
    mockOpenInShell.mockReset();
    mockOpenFolder.mockReset();
    mockSyncMain.mockReset();
    mockDeploy.mockReset();
    mockStop.mockReset();
    mockHookReturn = {
      openInIde: mockOpenInIde,
      openInShell: mockOpenInShell,
      openFolder: mockOpenFolder,
      syncMain: mockSyncMain,
      ideLoading: false,
      shellLoading: false,
      folderLoading: false,
      syncLoading: false,
      ideError: null,
      shellError: null,
      folderError: null,
      syncError: null,
    };
    mockDeployHookReturn = {
      deploy: mockDeploy,
      stop: mockStop,
      deployLoading: false,
      stopLoading: false,
      deployError: null,
      status: null,
      url: null,
    };
  });

  describe('action buttons rendering', () => {
    it('renders IDE and Shell buttons when repositoryPath is provided', () => {
      renderNode(dataWithRepoPath);

      expect(screen.getByRole('button', { name: /open in ide/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open in shell/i })).toBeInTheDocument();
    });

    it('does not render action buttons when repositoryPath is absent', () => {
      renderNode(defaultData);

      expect(screen.queryByRole('button', { name: /open in ide/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /open in shell/i })).not.toBeInTheDocument();
    });
  });

  describe('action button clicks', () => {
    it('IDE button click calls openInIde', () => {
      renderNode(dataWithRepoPath);

      fireEvent.click(screen.getByRole('button', { name: /open in ide/i }));

      expect(mockOpenInIde).toHaveBeenCalledOnce();
    });

    it('Shell button click calls openInShell', () => {
      renderNode(dataWithRepoPath);

      fireEvent.click(screen.getByRole('button', { name: /open in shell/i }));

      expect(mockOpenInShell).toHaveBeenCalledOnce();
    });

    it('action button click does not trigger parent onClick', () => {
      const onClick = vi.fn();
      renderNode({ ...dataWithRepoPath, onClick });

      fireEvent.click(screen.getByRole('button', { name: /open in ide/i }));

      expect(onClick).not.toHaveBeenCalled();
      expect(mockOpenInIde).toHaveBeenCalledOnce();
    });
  });

  describe('loading states', () => {
    it('shows loading spinner on IDE button when ideLoading is true', () => {
      mockHookReturn = { ...mockHookReturn, ideLoading: true };
      renderNode(dataWithRepoPath);

      const ideButton = screen.getByRole('button', { name: /open in ide/i });
      expect(ideButton.querySelector('.animate-spin')).toBeInTheDocument();
      expect(ideButton).toBeDisabled();
    });

    it('shows loading spinner on Shell button when shellLoading is true', () => {
      mockHookReturn = { ...mockHookReturn, shellLoading: true };
      renderNode(dataWithRepoPath);

      const shellButton = screen.getByRole('button', { name: /open in shell/i });
      expect(shellButton.querySelector('.animate-spin')).toBeInTheDocument();
      expect(shellButton).toBeDisabled();
    });
  });

  describe('error states', () => {
    it('shows error icon on IDE button when ideError is set', () => {
      mockHookReturn = { ...mockHookReturn, ideError: 'IDE not found' };
      renderNode(dataWithRepoPath);

      const ideButton = screen.getByRole('button', { name: /open in ide/i });
      expect(ideButton.querySelector('.lucide-circle-alert')).toBeInTheDocument();
      expect(ideButton).toHaveClass('text-destructive');
    });

    it('shows error icon on Shell button when shellError is set', () => {
      mockHookReturn = { ...mockHookReturn, shellError: 'Shell error' };
      renderNode(dataWithRepoPath);

      const shellButton = screen.getByRole('button', { name: /open in shell/i });
      expect(shellButton.querySelector('.lucide-circle-alert')).toBeInTheDocument();
      expect(shellButton).toHaveClass('text-destructive');
    });
  });

  describe('tooltip accessibility', () => {
    it('IDE button has aria-label "Open in IDE"', () => {
      renderNode(dataWithRepoPath);

      expect(screen.getByRole('button', { name: /open in ide/i })).toHaveAttribute(
        'aria-label',
        'Open in IDE'
      );
    });

    it('Shell button has aria-label "Open in Shell"', () => {
      renderNode(dataWithRepoPath);

      expect(screen.getByRole('button', { name: /open in shell/i })).toHaveAttribute(
        'aria-label',
        'Open in Shell'
      );
    });
  });

  describe('node width', () => {
    it('uses fixed w-[26rem] class on the main card element', () => {
      renderNode(dataWithRepoPath);

      const card = screen.getByTestId('repository-node-card');
      expect(card).toHaveClass('w-[26rem]');
    });
  });

  describe('delete button', () => {
    it('renders delete button when onDelete and id are provided', () => {
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete: vi.fn() });

      expect(screen.getByTestId('repository-node-delete-button')).toBeInTheDocument();
    });

    it('does not render delete button when onDelete is absent', () => {
      renderNode(dataWithRepoPath);

      expect(screen.queryByTestId('repository-node-delete-button')).not.toBeInTheDocument();
    });

    it('does not render delete button when id is absent', () => {
      renderNode({ ...dataWithRepoPath, onDelete: vi.fn() });

      expect(screen.queryByTestId('repository-node-delete-button')).not.toBeInTheDocument();
    });

    it('opens confirmation dialog when delete button is clicked', () => {
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete: vi.fn() });

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('repository-node-delete-button'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Remove repository?')).toBeInTheDocument();
    });

    it('calls onDelete only after confirming in the dialog', () => {
      const onDelete = vi.fn();
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete });

      fireEvent.click(screen.getByTestId('repository-node-delete-button'));
      expect(onDelete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      expect(onDelete).toHaveBeenCalledWith('repo-abc', { deleteFromDisk: false });
    });

    it('passes deleteFromDisk: true when the toggle is checked before confirming', () => {
      const onDelete = vi.fn();
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete });

      fireEvent.click(screen.getByTestId('repository-node-delete-button'));
      fireEvent.click(screen.getByTestId('repository-node-delete-from-disk-checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onDelete).toHaveBeenCalledWith('repo-abc', { deleteFromDisk: true });
    });

    it('resets the deleteFromDisk toggle when the dialog is reopened', () => {
      const onDelete = vi.fn();
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete });

      // Open, check, cancel
      fireEvent.click(screen.getByTestId('repository-node-delete-button'));
      fireEvent.click(screen.getByTestId('repository-node-delete-from-disk-checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      // Reopen, confirm — should be false again
      fireEvent.click(screen.getByTestId('repository-node-delete-button'));
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onDelete).toHaveBeenCalledWith('repo-abc', { deleteFromDisk: false });
    });

    it('does not call onDelete when cancel is clicked', () => {
      const onDelete = vi.fn();
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onDelete });

      fireEvent.click(screen.getByTestId('repository-node-delete-button'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('delete button click does not trigger parent onClick', () => {
      const onClick = vi.fn();
      const onDelete = vi.fn();
      renderNode({ ...dataWithRepoPath, id: 'repo-abc', onClick, onDelete });

      fireEvent.click(screen.getByTestId('repository-node-delete-button'));

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('deploy button', () => {
    it('renders Deploy button when repositoryPath is provided', () => {
      renderNode(dataWithRepoPath);

      expect(screen.getByRole('button', { name: /start dev server/i })).toBeInTheDocument();
    });

    it('does not render Deploy button when repositoryPath is absent', () => {
      renderNode(defaultData);

      expect(screen.queryByRole('button', { name: /start dev server/i })).not.toBeInTheDocument();
    });

    it('clicking Deploy calls the deploy action', () => {
      renderNode(dataWithRepoPath);

      fireEvent.click(screen.getByRole('button', { name: /start dev server/i }));

      expect(mockDeploy).toHaveBeenCalledOnce();
    });

    it('shows Stop button when deployment is active', () => {
      mockDeployHookReturn = { ...mockDeployHookReturn, status: 'Booting' };
      renderNode(dataWithRepoPath);

      expect(screen.getByRole('button', { name: /stop dev server/i })).toBeInTheDocument();
    });

    it('clicking Stop calls the stop action', () => {
      mockDeployHookReturn = { ...mockDeployHookReturn, status: 'Ready' };
      renderNode(dataWithRepoPath);

      fireEvent.click(screen.getByRole('button', { name: /stop dev server/i }));

      expect(mockStop).toHaveBeenCalledOnce();
    });

    it('shows URL link when deployment is Ready with url', () => {
      mockDeployHookReturn = {
        ...mockDeployHookReturn,
        status: 'Ready',
        url: 'http://localhost:3000',
      };
      renderNode(dataWithRepoPath);

      const link = screen.getByRole('link', { name: /localhost:3000/ });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'http://localhost:3000');
    });

    it('shows "Run" label when deployment is not active', () => {
      renderNode(dataWithRepoPath);

      expect(screen.getByText('Run')).toBeInTheDocument();
    });

    it('shows "Starting..." when deployment is Booting without url', () => {
      mockDeployHookReturn = {
        ...mockDeployHookReturn,
        status: 'Booting',
        url: null,
      };
      renderNode(dataWithRepoPath);

      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });
  });

  describe('pulse add animation', () => {
    it('applies pulse animation class when pulseAdd is true', () => {
      renderNode({ ...defaultData, onAdd: vi.fn(), pulseAdd: true });

      const addButton = screen.getByTestId('repository-node-add-button');
      expect(addButton).toHaveClass('animate-pulse-cta');
    });

    it('does not apply pulse animation class when pulseAdd is false', () => {
      renderNode({ ...defaultData, onAdd: vi.fn(), pulseAdd: false });

      const addButton = screen.getByTestId('repository-node-add-button');
      expect(addButton).not.toHaveClass('animate-pulse-cta');
    });

    it('does not apply pulse animation class when pulseAdd is not set', () => {
      renderNode({ ...defaultData, onAdd: vi.fn() });

      const addButton = screen.getByTestId('repository-node-add-button');
      expect(addButton).not.toHaveClass('animate-pulse-cta');
    });
  });

  describe('existing behavior preserved', () => {
    it('renders repository name', () => {
      renderNode(defaultData);

      expect(screen.getByTestId('repository-node-name')).toHaveTextContent('shep-ai/shep');
    });

    it('renders add button when onAdd is provided', () => {
      renderNode({ ...defaultData, onAdd: vi.fn() });

      expect(screen.getByTestId('repository-node-add-button')).toBeInTheDocument();
    });

    it('calls onClick when card is clicked', () => {
      const onClick = vi.fn();
      renderNode({ ...defaultData, onClick });

      fireEvent.click(screen.getByTestId('repository-node-card'));

      expect(onClick).toHaveBeenCalledOnce();
    });
  });

  describe('git info display', () => {
    it('renders branch name when branch is provided', () => {
      renderNode({ ...defaultData, branch: 'main' });

      expect(screen.getByTestId('repository-node-git-info')).toBeInTheDocument();
      expect(screen.getByTestId('repository-node-branch')).toHaveTextContent('main');
    });

    it('renders behind count when behindCount is greater than 0', () => {
      renderNode({ ...defaultData, branch: 'feat/test', behindCount: 5 });

      const behind = screen.getByTestId('repository-node-behind');
      expect(behind).toBeInTheDocument();
      expect(behind).toHaveTextContent('5 behind');
    });

    it('does not render behind count when behindCount is 0', () => {
      renderNode({ ...defaultData, branch: 'main', behindCount: 0 });

      expect(screen.queryByTestId('repository-node-behind')).not.toBeInTheDocument();
    });

    it('does not render behind count when behindCount is null', () => {
      renderNode({ ...defaultData, branch: 'main', behindCount: null });

      expect(screen.queryByTestId('repository-node-behind')).not.toBeInTheDocument();
    });

    it('does not render git info section when branch is not provided', () => {
      renderNode(defaultData);

      expect(screen.queryByTestId('repository-node-git-info')).not.toBeInTheDocument();
    });
  });

  describe('commit info display', () => {
    it('renders commit message when commitMessage is provided', () => {
      renderNode({
        ...defaultData,
        branch: 'main',
        commitMessage: 'feat: add login page',
        committer: 'Jane Doe',
      });

      expect(screen.getByTestId('repository-node-commit-info')).toBeInTheDocument();
      expect(screen.getByTestId('repository-node-commit-message')).toHaveTextContent(
        'feat: add login page'
      );
    });

    it('renders committer name when committer is provided', () => {
      renderNode({
        ...defaultData,
        branch: 'main',
        commitMessage: 'fix: typo',
        committer: 'John Smith',
      });

      expect(screen.getByTestId('repository-node-committer')).toHaveTextContent('John Smith');
    });

    it('does not render committer when committer is absent', () => {
      renderNode({ ...defaultData, commitMessage: 'fix: typo' });

      expect(screen.queryByTestId('repository-node-committer')).not.toBeInTheDocument();
    });

    it('does not render commit info section when commitMessage is not provided', () => {
      renderNode(defaultData);

      expect(screen.queryByTestId('repository-node-commit-info')).not.toBeInTheDocument();
    });
  });
});
