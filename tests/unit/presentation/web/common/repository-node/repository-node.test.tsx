import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
}));
import { RepositoryNode } from '@/components/common/repository-node';
import type { RepositoryNodeData, RepositoryNodeType } from '@/components/common/repository-node';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

const nodeTypes = { repositoryNode: RepositoryNode };

const defaultData: RepositoryNodeData = {
  name: 'shep-ai/shep',
};

function renderRepositoryNode(dataOverrides?: Partial<RepositoryNodeData>) {
  const data = { ...defaultData, ...dataOverrides };
  const nodes: RepositoryNodeType[] = [
    { id: 'test-node', type: 'repositoryNode', position: { x: 0, y: 0 }, data },
  ];
  return render(
    <ReactFlowProvider>
      <ReactFlow nodes={nodes} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} />
    </ReactFlowProvider>
  );
}

describe('RepositoryNode', () => {
  it('renders repository name', () => {
    renderRepositoryNode({ name: 'shep-ai/shep' });
    expect(screen.getByText('shep-ai/shep')).toBeInTheDocument();
  });

  it('renders GitHub icon', () => {
    const { container } = renderRepositoryNode();
    const svg = container.querySelector('svg.lucide-github');
    expect(svg).toBeInTheDocument();
  });

  it('does not render add button when onAdd is not provided', () => {
    renderRepositoryNode();
    expect(screen.queryByTestId('repository-node-add-button')).not.toBeInTheDocument();
  });

  it('renders add button when onAdd is provided', () => {
    renderRepositoryNode({ onAdd: () => undefined });
    expect(screen.getByTestId('repository-node-add-button')).toBeInTheDocument();
  });

  it('add button fires onAdd callback', () => {
    const onAdd = vi.fn();
    renderRepositoryNode({ onAdd });
    const addButton = screen.getByTestId('repository-node-add-button');
    fireEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('renders Handle components when showHandles is true', () => {
    const { container } = renderRepositoryNode({ showHandles: true });
    const handles = container.querySelectorAll('.react-flow__handle');
    expect(handles.length).toBeGreaterThanOrEqual(1);
  });

  it('renders source handle when onAdd is provided', () => {
    const { container } = renderRepositoryNode({ onAdd: () => undefined });
    const sourceHandle = container.querySelector('.react-flow__handle-right');
    expect(sourceHandle).toBeInTheDocument();
  });
});
