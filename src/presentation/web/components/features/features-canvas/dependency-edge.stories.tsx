import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { DependencyEdge } from './dependency-edge';
import { FeatureNode } from '@/components/common/feature-node';
import type { FeatureNodeData } from '@/components/common/feature-node';

import '@xyflow/react/dist/style.css';

const meta: Meta = {
  title: 'Features/DependencyEdge',
  decorators: [
    (Story) => (
      <div style={{ width: '800px', height: '400px' }}>
        <ReactFlowProvider>
          <Story />
        </ReactFlowProvider>
      </div>
    ),
  ],
};

export default meta;

const parentData: FeatureNodeData = {
  name: 'Auth System',
  description: 'User authentication',
  featureId: 'feat-1234',
  lifecycle: 'implementation',
  state: 'running',
  progress: 60,
  repositoryPath: '/repo',
  branch: 'feat/auth',
  showHandles: true,
};

const childData: FeatureNodeData = {
  name: 'Login Page',
  description: 'Login UI component',
  featureId: 'feat-5678',
  lifecycle: 'requirements',
  state: 'blocked',
  progress: 0,
  repositoryPath: '/repo',
  branch: 'feat/login',
  blockedBy: 'Auth System',
  showHandles: true,
};

/** Default dependency edge — hover to reveal delete button. */
export const Default: StoryObj = {
  render: () => (
    <ReactFlow
      nodes={[
        {
          id: 'parent',
          type: 'featureNode',
          position: { x: 50, y: 100 },
          data: parentData,
        },
        {
          id: 'child',
          type: 'featureNode',
          position: { x: 450, y: 100 },
          data: childData,
        },
      ]}
      edges={[
        {
          id: 'dep-1',
          source: 'parent',
          target: 'child',
          type: 'dependencyEdge',
        },
      ]}
      nodeTypes={{ featureNode: FeatureNode }}
      edgeTypes={{ dependencyEdge: DependencyEdge }}
      fitView
      nodesDraggable={false}
      nodesConnectable={true}
      elementsSelectable={true}
      proOptions={{ hideAttribution: true }}
    />
  ),
};

/** Edge in selected state — shows delete button and blue highlight stroke. */
export const Selected: StoryObj = {
  render: () => (
    <ReactFlow
      nodes={[
        {
          id: 'parent',
          type: 'featureNode',
          position: { x: 50, y: 100 },
          data: parentData,
        },
        {
          id: 'child',
          type: 'featureNode',
          position: { x: 450, y: 100 },
          data: childData,
        },
      ]}
      edges={[
        {
          id: 'dep-1',
          source: 'parent',
          target: 'child',
          type: 'dependencyEdge',
          selected: true,
        },
      ]}
      nodeTypes={{ featureNode: FeatureNode }}
      edgeTypes={{ dependencyEdge: DependencyEdge }}
      fitView
      nodesDraggable={false}
      nodesConnectable={true}
      elementsSelectable={true}
      proOptions={{ hideAttribution: true }}
    />
  ),
};
