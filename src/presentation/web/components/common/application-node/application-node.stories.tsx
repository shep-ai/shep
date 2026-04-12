import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';
import { ApplicationNode } from './application-node';
import type { ApplicationNodeData, ApplicationNodeType } from './application-node-config';

const nodeTypes = { applicationNode: ApplicationNode };

function ApplicationNodeCanvas({
  data,
  style = { width: 550, height: 350 },
}: {
  data: ApplicationNodeData;
  style?: React.CSSProperties;
}) {
  const nodes: ApplicationNodeType[] = useMemo(
    () => [{ id: 'node-1', type: 'applicationNode', position: { x: 0, y: 0 }, data }],
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

const meta: Meta<ApplicationNodeData> = {
  title: 'Composed/ApplicationNode',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    id: 'app-1',
    name: 'Dashboard App',
    description: 'Main web dashboard for analytics',
    status: 'Idle',
    repositoryPath: '/home/user/dashboard-app',
    additionalPathCount: 0,
  },
};

export default meta;
type Story = StoryObj<ApplicationNodeData>;

export const Default: Story = {
  render: (args) => <ApplicationNodeCanvas data={args} />,
};

export const Active: Story = {
  args: {
    status: 'Active',
  },
  render: (args) => <ApplicationNodeCanvas data={args} />,
};

export const Error: Story = {
  args: {
    status: 'Error',
  },
  render: (args) => <ApplicationNodeCanvas data={args} />,
};

export const WithDeleteButton: Story = {
  args: {
    id: 'app-abc-123',
  },
  argTypes: {
    onDelete: { action: 'onDelete' },
  },
  render: (args) => <ApplicationNodeCanvas data={args} style={{ width: 600, height: 350 }} />,
};

export const LongName: Story = {
  args: {
    name: 'A Very Long Application Name That Should Truncate Nicely In The Card Header',
  },
  render: (args) => <ApplicationNodeCanvas data={args} />,
};

const multipleApps: ApplicationNodeData[] = [
  {
    id: 'app-1',
    name: 'Dashboard App',
    description: 'Main web dashboard for analytics',
    status: 'Active',
    repositoryPath: '/home/user/dashboard-app',
    additionalPathCount: 0,
  },
  {
    id: 'app-2',
    name: 'Auth Service',
    description: 'Authentication microservice',
    status: 'Idle',
    repositoryPath: '/home/user/auth-service',
    additionalPathCount: 2,
  },
  {
    id: 'app-3',
    name: 'Payment Gateway',
    description: 'Payment processing service',
    status: 'Error',
    repositoryPath: '/home/user/payment-gateway',
    additionalPathCount: 0,
  },
  {
    id: 'app-4',
    name: 'Mobile API',
    description: 'REST API for mobile clients',
    status: 'Active',
    repositoryPath: '/home/user/mobile-api',
    additionalPathCount: 1,
  },
];

export const Multiple: Story = {
  render: () => {
    const nodes: ApplicationNodeType[] = multipleApps.map((data, i) => ({
      id: `app-${i}`,
      type: 'applicationNode' as const,
      position: { x: 0, y: i * 220 },
      data,
    }));

    return (
      <div style={{ width: 600, height: 950 }}>
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
  },
};
