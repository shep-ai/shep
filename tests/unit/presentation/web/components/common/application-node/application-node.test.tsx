import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApplicationNode } from '@/components/common/application-node/application-node';
import type { ApplicationNodeData } from '@/components/common/application-node/application-node-config';

// Mock @xyflow/react — ApplicationNode uses Handle and Position
vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}-${position}`} />
  ),
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

function renderNode(data: ApplicationNodeData = defaultData) {
  return render(<ApplicationNode data={data} />);
}

describe('ApplicationNode', () => {
  describe('basic rendering', () => {
    it('renders application name', () => {
      renderNode();

      expect(screen.getByTestId('application-node-name')).toHaveTextContent('Dashboard App');
    });

    it('renders status text', () => {
      renderNode();

      expect(screen.getByTestId('application-node-status-text')).toHaveTextContent('Idle');
    });

    it('renders Active status with green dot', () => {
      renderNode({ ...defaultData, status: 'Active' });

      expect(screen.getByTestId('application-node-status-text')).toHaveTextContent('Active');
      expect(screen.getByTestId('application-node-status-dot')).toHaveClass('bg-green-500');
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
    it('renders handles when showHandles is true', () => {
      renderNode({ ...defaultData, showHandles: true });

      expect(screen.getByTestId('handle-target-left')).toBeInTheDocument();
      expect(screen.getByTestId('handle-source-right')).toBeInTheDocument();
    });

    it('does not render handles when showHandles is false', () => {
      renderNode({ ...defaultData, showHandles: false });

      expect(screen.queryByTestId('handle-target-left')).not.toBeInTheDocument();
      expect(screen.queryByTestId('handle-source-right')).not.toBeInTheDocument();
    });
  });
});
