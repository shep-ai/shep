import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';
import { RepositoryNode } from './repository-node';
import type { RepositoryNodeData, RepositoryNodeType } from './repository-node-config';

const nodeTypes = { repositoryNode: RepositoryNode };

function RepositoryNodeCanvas({
  data,
  style = { width: 550, height: 300 },
}: {
  data: RepositoryNodeData;
  style?: React.CSSProperties;
}) {
  const nodes: RepositoryNodeType[] = useMemo(
    () => [{ id: 'node-1', type: 'repositoryNode', position: { x: 0, y: 0 }, data }],
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

const meta: Meta<RepositoryNodeData> = {
  title: 'Composed/RepositoryNode',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'shep-ai/shep',
    branch: 'main',
    commitMessage: 'feat: add dark mode toggle',
    committer: 'Jane Doe',
  },
};

export default meta;
type Story = StoryObj<RepositoryNodeData>;

export const Default: Story = {
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const WithAddButton: Story = {
  argTypes: {
    onAdd: { action: 'onAdd' },
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const WithHandles: Story = {
  args: {
    showHandles: true,
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const LongName: Story = {
  args: {
    name: 'some-very-long-organization-name/repository-with-a-really-long-name',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

const onAdd = () => undefined;

const multipleRepos: RepositoryNodeData[] = [
  {
    name: 'shep-ai/shep',
    branch: 'main',
    commitMessage: 'feat: add dark mode toggle',
    committer: 'Jane Doe',
  },
  {
    name: 'vercel/edge-runtime',
    branch: 'feat/streaming',
    commitMessage: 'fix: handle edge cases in streaming',
    committer: 'John Smith',
    behindCount: 3,
  },
  {
    name: 'acme-corp/web-dashboard-v2',
    branch: 'develop',
    commitMessage: 'chore: update dependencies',
    committer: 'Bot',
    behindCount: 12,
  },
  {
    name: 'openai/tiktoken',
    branch: 'main',
    commitMessage: 'perf: optimize token encoding',
    committer: 'Alice Chen',
  },
];

export const Multiple: Story = {
  render: () => {
    const nodes: RepositoryNodeType[] = multipleRepos.map((data, i) => ({
      id: `repo-${i}`,
      type: 'repositoryNode' as const,
      position: { x: 0, y: i * 140 },
      data,
    }));

    return (
      <div style={{ width: 600, height: 750 }}>
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

const multipleReposWithButton: RepositoryNodeData[] = [
  {
    name: 'shep-ai/shep',
    onAdd,
    branch: 'main',
    commitMessage: 'feat: add dark mode toggle',
    committer: 'Jane Doe',
  },
  {
    name: 'vercel/edge-runtime',
    onAdd,
    branch: 'feat/streaming',
    commitMessage: 'fix: handle edge cases in streaming',
    committer: 'John Smith',
    behindCount: 3,
  },
  {
    name: 'acme-corp/web-dashboard-v2',
    onAdd,
    branch: 'develop',
    commitMessage: 'chore: update dependencies',
    committer: 'Bot',
  },
  {
    name: 'openai/tiktoken',
    onAdd,
    branch: 'main',
    commitMessage: 'perf: optimize token encoding',
    committer: 'Alice Chen',
  },
];

export const MultipleWithButton: Story = {
  render: () => {
    const nodes: RepositoryNodeType[] = multipleReposWithButton.map((data, i) => ({
      id: `repo-${i}`,
      type: 'repositoryNode' as const,
      position: { x: 0, y: i * 140 },
      data,
    }));

    return (
      <div style={{ width: 600, height: 750 }}>
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

export const WithPulseAdd: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
    pulseAdd: true,
  },
  argTypes: {
    onAdd: { action: 'onAdd' },
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const WithActions: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const WithActionsAndAddButton: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
  },
  argTypes: {
    onAdd: { action: 'onAdd' },
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

const onDelete = () => undefined;

export const WithDeleteButton: Story = {
  args: {
    id: 'repo-abc-123',
    repositoryPath: '/home/user/shep-ai/shep',
  },
  argTypes: {
    onDelete: { action: 'onDelete' },
  },
  render: (args) => <RepositoryNodeCanvas data={args} style={{ width: 600, height: 300 }} />,
};

const multipleReposWithActions: RepositoryNodeData[] = [
  {
    id: 'r1',
    name: 'shep-ai/shep',
    repositoryPath: '/home/user/shep-ai/shep',
    onAdd,
    onDelete,
    branch: 'main',
    commitMessage: 'feat(web): enrich repository node with branch and commit info',
    committer: 'Ariel Shadkhan',
  },
  {
    id: 'r2',
    name: 'vercel/edge-runtime',
    repositoryPath: '/home/user/vercel/edge-runtime',
    onAdd,
    onDelete,
    branch: 'feat/streaming-v2',
    commitMessage: 'fix: handle edge cases in streaming response',
    committer: 'John Smith',
    behindCount: 5,
  },
  {
    id: 'r3',
    name: 'acme-corp/web-dashboard-v2',
    repositoryPath: '/home/user/acme-corp/web-dashboard-v2',
    onAdd,
    onDelete,
    branch: 'develop',
    commitMessage: 'chore(deps): update all dependencies to latest',
    committer: 'Renovate Bot',
    behindCount: 23,
  },
  {
    id: 'r4',
    name: 'openai/tiktoken',
    repositoryPath: '/home/user/openai/tiktoken',
    onAdd,
    onDelete,
    branch: 'main',
    commitMessage: 'perf: optimize token encoding for large inputs',
    committer: 'Alice Chen',
  },
];

export const WithWebhookButton: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/cli',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const MultipleWithActions: Story = {
  render: () => {
    const nodes: RepositoryNodeType[] = multipleReposWithActions.map((data, i) => ({
      id: `repo-${i}`,
      type: 'repositoryNode' as const,
      position: { x: 0, y: i * 140 },
      data,
    }));

    return (
      <div style={{ width: 600, height: 800 }}>
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

export const WithGitInfo: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
    branch: 'feat/repo-node-enrichment',
    commitMessage: 'feat(web): enrich repository node with branch and commit info',
    committer: 'Ariel Shadkhan',
    behindCount: 0,
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const WithGitInfoBehind: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
    branch: 'feat/old-feature-branch',
    commitMessage: 'fix: resolve merge conflict in auth module',
    committer: 'Jane Doe',
    behindCount: 7,
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const GitInfoLoading: Story = {
  args: {
    repositoryPath: '/home/user/shep-ai/shep',
    gitInfoStatus: 'loading',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};

export const NotAGitRepo: Story = {
  args: {
    repositoryPath: '/home/user/my-project',
    gitInfoStatus: 'not-a-repo',
  },
  render: (args) => <RepositoryNodeCanvas data={args} />,
};
