import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeaturesCanvas } from '@/components/features/features-canvas';
import type { FeatureNodeType } from '@/components/common/feature-node';
import type { RepositoryNodeType } from '@/components/common/repository-node';
import type { Viewport } from '@/hooks/use-viewport-persistence';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
}));

const mockOnAction = vi.fn();
const mockOnSettings = vi.fn();
const mockOnDelete = vi.fn();

const mockNode: FeatureNodeType = {
  id: 'node-1',
  type: 'featureNode',
  position: { x: 0, y: 0 },
  data: {
    name: 'Test Feature',
    description: 'A test feature',
    featureId: '#f1',
    lifecycle: 'requirements',
    state: 'running',
    progress: 50,
    repositoryPath: '/home/user/my-repo',
    branch: 'feat/test-feature',
    agentType: 'claude-code',
    onAction: () => mockOnAction('node-1'),
    onSettings: () => mockOnSettings('node-1'),
    onDelete: mockOnDelete,
  },
};

describe('FeaturesCanvas', () => {
  it('renders empty state when nodes is empty', () => {
    render(<FeaturesCanvas nodes={[]} edges={[]} />);
    expect(screen.getByText('No features yet')).toBeInTheDocument();
    expect(screen.getByText('Get started by creating your first feature.')).toBeInTheDocument();
    expect(screen.getByTestId('features-canvas-empty')).toBeInTheDocument();
  });

  it('empty state button fires onAddFeature', () => {
    const onAddFeature = vi.fn();
    render(<FeaturesCanvas nodes={[]} edges={[]} onAddFeature={onAddFeature} />);
    const button = screen.getByRole('button', { name: /new feature/i });
    fireEvent.click(button);
    expect(onAddFeature).toHaveBeenCalledOnce();
  });

  it('renders ReactFlow when nodes are provided', () => {
    render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
    expect(screen.getByTestId('features-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('features-canvas-empty')).not.toBeInTheDocument();
  });

  it('renders node with onAction callback from node data', () => {
    render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
    expect(screen.getByText('Test Feature')).toBeInTheDocument();
    const actionButton = screen.getByTestId('feature-node-action-button');
    fireEvent.click(actionButton);
    expect(mockOnAction).toHaveBeenCalledWith('node-1');
  });

  it('renders node content from node data', () => {
    render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
    expect(screen.getByText('Test Feature')).toBeInTheDocument();
    expect(screen.getByTestId('feature-node-card')).toBeInTheDocument();
  });

  it('wires onAdd from repository node data', () => {
    const mockOnAdd = vi.fn();
    const mockRepoNode: RepositoryNodeType = {
      id: 'repo-1',
      type: 'repositoryNode',
      position: { x: 0, y: 0 },
      data: { name: 'shep-ai/shep', onAdd: mockOnAdd, showHandles: true },
    };
    render(
      <FeaturesCanvas
        nodes={[mockRepoNode]}
        edges={[{ id: 'e1', source: 'repo-1', target: 'feat-1' }]}
      />
    );
    const addButton = screen.getByTestId('repository-node-add-button');
    fireEvent.click(addButton);
    expect(mockOnAdd).toHaveBeenCalled();
  });

  it('renders toolbar when provided', () => {
    render(
      <FeaturesCanvas
        nodes={[mockNode]}
        edges={[]}
        toolbar={<div data-testid="custom-toolbar">Toolbar</div>}
      />
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
  });

  describe('non-interactive guard for creating state', () => {
    const creatingNode: FeatureNodeType = {
      id: 'creating-1',
      type: 'featureNode',
      position: { x: 0, y: 0 },
      data: {
        name: 'Optimistic Feature',
        featureId: '#c1',
        lifecycle: 'requirements',
        state: 'creating',
        progress: 0,
        repositoryPath: '/home/user/repo',
        branch: '',
        // No onAction/onSettings/onDelete — creating nodes don't get callbacks
      },
    };

    it('does not show action button for feature nodes with state "creating"', () => {
      render(<FeaturesCanvas nodes={[creatingNode]} edges={[]} />);
      expect(screen.queryByTestId('feature-node-action-button')).not.toBeInTheDocument();
    });

    it('does not show settings button for feature nodes with state "creating"', () => {
      render(<FeaturesCanvas nodes={[creatingNode]} edges={[]} />);
      expect(screen.queryByTestId('feature-node-agent-badge')).not.toBeInTheDocument();
    });

    it('does not show delete button for feature nodes with state "creating"', () => {
      render(<FeaturesCanvas nodes={[creatingNode]} edges={[]} />);
      expect(screen.queryByTestId('feature-node-delete-button')).not.toBeInTheDocument();
    });

    it('shows action button for feature nodes with state "running" (callbacks in data)', () => {
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
      expect(screen.getByTestId('feature-node-action-button')).toBeInTheDocument();
    });

    it('shows card for feature nodes with state "running" (callbacks in data)', () => {
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
      expect(screen.getByTestId('feature-node-card')).toBeInTheDocument();
    });

    it('shows delete button for non-creating feature nodes (onDelete in data)', () => {
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
      expect(screen.getByTestId('feature-node-delete-button')).toBeInTheDocument();
    });

    it('only running nodes have action buttons in mixed array', () => {
      render(<FeaturesCanvas nodes={[creatingNode, mockNode]} edges={[]} />);
      const actionButtons = screen.getAllByTestId('feature-node-action-button');
      expect(actionButtons).toHaveLength(1);
      fireEvent.click(actionButtons[0]);
      expect(mockOnAction).toHaveBeenCalledWith('node-1');
    });
  });

  describe('fast-mode features (implementation lifecycle)', () => {
    const fastModeNode: FeatureNodeType = {
      id: 'fast-1',
      type: 'featureNode',
      position: { x: 0, y: 0 },
      data: {
        name: 'Quick Fix',
        description: 'Fast-mode feature starting at implementation',
        featureId: '#ff1',
        lifecycle: 'implementation',
        state: 'running',
        progress: 30,
        repositoryPath: '/home/user/my-repo',
        branch: 'feat/quick-fix',
        agentType: 'claude-code',
        onAction: () => mockOnAction('fast-1'),
        onSettings: () => mockOnSettings('fast-1'),
        onDelete: mockOnDelete,
      },
    };

    it('renders feature node with lifecycle=implementation and state=running', () => {
      render(<FeaturesCanvas nodes={[fastModeNode]} edges={[]} />);
      expect(screen.getByText('Quick Fix')).toBeInTheDocument();
      expect(screen.getByTestId('features-canvas')).toBeInTheDocument();
    });

    it('renders action button for fast-mode running nodes', () => {
      render(<FeaturesCanvas nodes={[fastModeNode]} edges={[]} />);
      expect(screen.getByTestId('feature-node-action-button')).toBeInTheDocument();
    });

    it('renders graph with mix of fast-mode and full-pipeline features', () => {
      const fullPipelineNode: FeatureNodeType = {
        id: 'full-1',
        type: 'featureNode',
        position: { x: 0, y: 200 },
        data: {
          name: 'Auth Module',
          description: 'Full-pipeline feature',
          featureId: '#ff2',
          lifecycle: 'requirements',
          state: 'running',
          progress: 15,
          repositoryPath: '/home/user/my-repo',
          branch: 'feat/auth-module',
          onAction: () => mockOnAction('full-1'),
          onSettings: () => mockOnSettings('full-1'),
          onDelete: mockOnDelete,
        },
      };

      render(<FeaturesCanvas nodes={[fastModeNode, fullPipelineNode]} edges={[]} />);
      expect(screen.getByText('Quick Fix')).toBeInTheDocument();
      expect(screen.getByText('Auth Module')).toBeInTheDocument();
      // Both nodes should have action buttons
      expect(screen.getAllByTestId('feature-node-action-button')).toHaveLength(2);
    });
  });

  describe('viewport persistence props', () => {
    it('renders with custom defaultViewport prop', () => {
      const customViewport: Viewport = { x: 100, y: 200, zoom: 1.5 };
      // Should render without errors when a custom viewport is provided
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} defaultViewport={customViewport} />);
      expect(screen.getByTestId('features-canvas')).toBeInTheDocument();
    });

    it('renders with default viewport when prop is not provided', () => {
      // Should render without errors using the fallback default viewport
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} />);
      expect(screen.getByTestId('features-canvas')).toBeInTheDocument();
    });

    it('accepts onMoveEnd callback prop', () => {
      const onMoveEnd = vi.fn();
      // Should render without errors when onMoveEnd is provided
      render(<FeaturesCanvas nodes={[mockNode]} edges={[]} onMoveEnd={onMoveEnd} />);
      expect(screen.getByTestId('features-canvas')).toBeInTheDocument();
    });
  });
});
