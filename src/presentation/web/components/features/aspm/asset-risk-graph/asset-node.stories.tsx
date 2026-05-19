import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AssetNode, type AssetNodeData } from './asset-node';

const meta: Meta<typeof AssetNode> = {
  title: 'Features/Aspm/AssetRiskGraph/AssetNode',
  component: AssetNode,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function story(data: AssetNodeData): Story {
  return {
    decorators: [],
    render: () => (
      <ReactFlowProvider>
        <div style={{ width: 220, height: 140, padding: 16 }}>
          <ReactFlow
            nodes={[{ id: 'n', type: 'asset', position: { x: 0, y: 0 }, data }]}
            edges={[]}
            nodeTypes={{ asset: AssetNode }}
            fitView={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          />
        </div>
      </ReactFlowProvider>
    ),
  };
}

export const Fleet = story({
  label: 'ASPM Fleet',
  kind: 'fleet',
  openFindingCount: 42,
  riskScoreSum: 1240,
});

export const Application = story({
  label: 'payments-service',
  kind: 'application',
  openFindingCount: 9,
  riskScoreSum: 380,
});

export const Owner = story({
  label: '@platform-security',
  kind: 'owner',
  openFindingCount: 0,
  riskScoreSum: 0,
});
