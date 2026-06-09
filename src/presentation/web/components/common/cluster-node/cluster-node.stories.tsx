import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';
import { ClusterStatus } from '@shepai/core/domain/generated/output';
import { ClusterNode } from './cluster-node';
import type { ClusterNodeData, ClusterNodeType } from './cluster-node-config';

const nodeTypes = { clusterNode: ClusterNode };

function ClusterNodeCanvas({
  data,
  style = { width: 450, height: 200 },
}: {
  data: ClusterNodeData;
  style?: React.CSSProperties;
}) {
  const nodes: ClusterNodeType[] = useMemo(
    () => [{ id: 'node-1', type: 'clusterNode', position: { x: 0, y: 0 }, data }],
    [data]
  );

  return (
    <div style={style}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          fitView
        />
      </ReactFlowProvider>
    </div>
  );
}

const meta: Meta<ClusterNodeData> = {
  title: 'Composed/ClusterNode',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'cluster-1',
    name: 'dev-cluster',
    description: 'Local development cluster',
    status: ClusterStatus.Stopped,
    linkedRepoCount: 0,
    linkedAppCount: 0,
    argoCdEnabled: false,
  },
};

export default meta;
type Story = StoryObj<ClusterNodeData>;

export const Default: Story = {
  render: (args) => <ClusterNodeCanvas data={args} />,
};

export const Ready: Story = {
  args: {
    status: ClusterStatus.Ready,
    linkedRepoCount: 2,
    linkedAppCount: 1,
  },
  render: (args) => <ClusterNodeCanvas data={args} />,
};

export const Provisioning: Story = {
  args: {
    status: ClusterStatus.Provisioning,
  },
  render: (args) => <ClusterNodeCanvas data={args} />,
};

export const Error: Story = {
  args: {
    status: ClusterStatus.Error,
  },
  render: (args) => <ClusterNodeCanvas data={args} />,
};

export const WithArgoCD: Story = {
  args: {
    status: ClusterStatus.Ready,
    argoCdEnabled: true,
    linkedRepoCount: 3,
    linkedAppCount: 2,
  },
  render: (args) => <ClusterNodeCanvas data={args} />,
};

export const WithDeleteButton: Story = {
  args: {
    id: 'cluster-abc-123',
  },
  argTypes: {
    onDelete: { action: 'onDelete' },
  },
  render: (args) => <ClusterNodeCanvas data={args} style={{ width: 500, height: 200 }} />,
};

export const LongName: Story = {
  args: {
    name: 'my-very-long-cluster-name-that-should-truncate-nicely-in-the-card',
  },
  render: (args) => <ClusterNodeCanvas data={args} />,
};
