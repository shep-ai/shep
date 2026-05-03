import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationNode } from '@/components/common/application-node/application-node';
import type { ApplicationNodeData } from '@/components/common/application-node/application-node-config';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import type { DeploymentStatusEntry } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { DeploymentState } from '@shepai/core/domain/generated/output';

// Mock @xyflow/react — ApplicationNode uses Handle and Position. The real
// Handle renders its children, and the SDD-feature action button is mounted
// as a child of the source handle, so the mock has to forward children too.
vi.mock('@xyflow/react', () => ({
  Handle: ({
    type,
    position,
    children,
  }: {
    type: string;
    position: string;
    children?: React.ReactNode;
  }) => <div data-testid={`handle-${type}-${position}`}>{children}</div>,
  Position: { Left: 'left', Right: 'right' },
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
}));

// Mock shadcn Dialog — controlled by `open` prop
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

const defaultData: ApplicationNodeData = {
  id: 'app-1',
  name: 'Dashboard App',
  description: 'Main web dashboard',
  status: 'Idle',
  repositoryPath: '/home/user/dashboard-app',
  additionalPathCount: 0,
};

function renderNode(
  data: ApplicationNodeData = defaultData,
  initialDeployments: DeploymentStatusEntry[] = []
) {
  return render(
    <DeploymentStatusProvider initialDeployments={initialDeployments}>
      <ApplicationNode data={data} />
    </DeploymentStatusProvider>
  );
}

describe('ApplicationNode', () => {
  describe('basic rendering', () => {
    it('renders application name', () => {
      renderNode();

      expect(screen.getByTestId('application-node-name')).toHaveTextContent('Dashboard App');
    });

    it('renders "Ready" as the default resting label (never "Idle")', () => {
      // With no dev server running and no in-flight agent turn, the
      // card falls through to "Ready" — a positive standby state.
      // The old "Idle" label was considered noise and is never shown.
      renderNode();

      expect(screen.getByTestId('application-node-status-text')).toHaveTextContent('Ready');
      expect(screen.getByTestId('application-node-status-text')).not.toHaveTextContent('Idle');
    });

    it('renders "Live" with an emerald dot when the dev server URL is present', () => {
      // The card folds the live DeploymentService state into the
      // status pill: any application whose dev server is up gets a
      // "Live" label regardless of the persisted coarse status. The
      // hook subscribes to the DeploymentStatusProvider, so we seed
      // it with a Ready entry keyed by the application id.
      renderNode(defaultData, [
        {
          targetId: defaultData.id,
          targetType: 'application',
          state: DeploymentState.Ready,
          url: 'http://localhost:5173',
        },
      ]);

      expect(screen.getByTestId('application-node-status-text')).toHaveTextContent('Live');
      expect(screen.getByTestId('application-node-status-dot')).toHaveClass('bg-emerald-500');
    });

    it('renders Error status with red dot', () => {
      renderNode({ ...defaultData, status: 'Error' });

      expect(screen.getByTestId('application-node-status-text')).toHaveTextContent('Error');
      expect(screen.getByTestId('application-node-status-dot')).toHaveClass('bg-red-500');
    });

    it('renders repository count as singular for one repo', () => {
      renderNode({ ...defaultData, additionalPathCount: 0 });

      expect(screen.getByTestId('application-node-repo-count')).toHaveTextContent('1 repository');
    });

    it('renders repository count as plural for multiple repos', () => {
      renderNode({ ...defaultData, additionalPathCount: 2 });

      expect(screen.getByTestId('application-node-repo-count')).toHaveTextContent('3 repositories');
    });
  });

  describe('card width', () => {
    it('uses fixed w-[26rem] class on the main card element', () => {
      renderNode();

      const card = screen.getByTestId('application-node-card');
      expect(card).toHaveClass('w-[26rem]');
    });
  });

  describe('click handling', () => {
    it('calls onClick when card is clicked', () => {
      const onClick = vi.fn();
      renderNode({ ...defaultData, onClick });

      fireEvent.click(screen.getByTestId('application-node-card'));

      expect(onClick).toHaveBeenCalledOnce();
    });

    it('calls onClick when Enter key is pressed', () => {
      const onClick = vi.fn();
      renderNode({ ...defaultData, onClick });

      fireEvent.keyDown(screen.getByTestId('application-node-card'), { key: 'Enter' });

      expect(onClick).toHaveBeenCalledOnce();
    });
  });

  describe('delete button', () => {
    it('renders delete button when onDelete and id are provided', () => {
      renderNode({ ...defaultData, id: 'app-abc', onDelete: vi.fn() });

      expect(screen.getByTestId('application-node-delete-button')).toBeInTheDocument();
    });

    it('does not render delete button when onDelete is absent', () => {
      renderNode(defaultData);

      expect(screen.queryByTestId('application-node-delete-button')).not.toBeInTheDocument();
    });

    it('opens confirmation dialog when delete button is clicked', () => {
      renderNode({ ...defaultData, id: 'app-abc', onDelete: vi.fn() });

      fireEvent.click(screen.getByTestId('application-node-delete-button'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Remove application?')).toBeInTheDocument();
    });

    it('calls onDelete only after confirming in the dialog', () => {
      const onDelete = vi.fn();
      renderNode({ ...defaultData, id: 'app-abc', onDelete });

      fireEvent.click(screen.getByTestId('application-node-delete-button'));
      expect(onDelete).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      expect(onDelete).toHaveBeenCalledWith('app-abc');
    });

    it('does not call onDelete when cancel is clicked', () => {
      const onDelete = vi.fn();
      renderNode({ ...defaultData, id: 'app-abc', onDelete });

      fireEvent.click(screen.getByTestId('application-node-delete-button'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('delete button click does not trigger parent onClick', () => {
      const onClick = vi.fn();
      const onDelete = vi.fn();
      renderNode({ ...defaultData, id: 'app-abc', onClick, onDelete });

      fireEvent.click(screen.getByTestId('application-node-delete-button'));

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('handles', () => {
    it('always renders handles for edge connections', () => {
      renderNode({ ...defaultData });

      expect(screen.getByTestId('handle-target-left')).toBeInTheDocument();
      expect(screen.getByTestId('handle-source-right')).toBeInTheDocument();
    });
  });

  describe('new SDD feature action', () => {
    it('renders the "New SDD feature" button when onCreateSddFeature is provided', () => {
      renderNode({ ...defaultData, onCreateSddFeature: vi.fn() });

      expect(screen.getByTestId('application-node-new-sdd-feature-button')).toBeInTheDocument();
    });

    it('does not render the action button when onCreateSddFeature is absent', () => {
      renderNode(defaultData);

      expect(
        screen.queryByTestId('application-node-new-sdd-feature-button')
      ).not.toBeInTheDocument();
    });

    it('calls onCreateSddFeature with the application id when clicked', () => {
      const onCreateSddFeature = vi.fn();
      renderNode({ ...defaultData, id: 'app-xyz', onCreateSddFeature });

      fireEvent.click(screen.getByTestId('application-node-new-sdd-feature-button'));

      expect(onCreateSddFeature).toHaveBeenCalledOnce();
      expect(onCreateSddFeature).toHaveBeenCalledWith('app-xyz');
    });

    it('does not trigger the parent onClick when the SDD action is clicked', () => {
      const onClick = vi.fn();
      const onCreateSddFeature = vi.fn();
      renderNode({ ...defaultData, id: 'app-xyz', onClick, onCreateSddFeature });

      fireEvent.click(screen.getByTestId('application-node-new-sdd-feature-button'));

      expect(onClick).not.toHaveBeenCalled();
    });

    it('exposes an aria-label for keyboard / screen-reader users', () => {
      renderNode({ ...defaultData, onCreateSddFeature: vi.fn() });

      const button = screen.getByTestId('application-node-new-sdd-feature-button');
      expect(button).toHaveAttribute('aria-label', 'New feature');
    });
  });
});
