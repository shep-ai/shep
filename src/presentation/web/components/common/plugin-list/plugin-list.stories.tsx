import { fn } from '@storybook/test';
import type { Meta, StoryObj } from '@storybook/react';
import {
  PluginHealthStatus,
  PluginType,
  PluginTransport,
  type Plugin,
} from '@shepai/core/domain/generated/output';
import { PluginList } from './plugin-list';

const meta = {
  title: 'Common/PluginList',
  component: PluginList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PluginList>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ---------------------------------------------------------------------------
 * Data fixtures
 * ------------------------------------------------------------------------- */

const now = new Date('2026-04-14T12:00:00Z');

const samplePlugins: Plugin[] = [
  {
    id: '1',
    name: 'mempalace',
    displayName: 'MemPalace',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Healthy,
    description: 'Local AI memory system with persistent knowledge storage. Provides 19 MCP tools.',
    transport: PluginTransport.Stdio,
    installSource: 'catalog',
    serverCommand: 'python',
    serverArgs: ['-m', 'mempalace.mcp_server'],
    runtimeType: 'python',
    runtimeMinVersion: '3.9',
    homepageUrl: 'https://github.com/MemPalace/mempalace',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '2',
    name: 'token-optimizer',
    displayName: 'Token Optimizer',
    type: PluginType.Hook,
    enabled: true,
    healthStatus: PluginHealthStatus.Degraded,
    healthMessage: 'Python runtime found but pip package not installed',
    description: 'Token waste reduction and context management via Claude Code lifecycle hooks.',
    installSource: 'catalog',
    runtimeType: 'python',
    runtimeMinVersion: '3.8',
    homepageUrl: 'https://github.com/alexgreensh/token-optimizer',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: '3',
    name: 'ruflo',
    displayName: 'Ruflo',
    type: PluginType.Mcp,
    enabled: false,
    healthStatus: PluginHealthStatus.Unavailable,
    healthMessage: 'Node.js runtime not found on PATH',
    description: 'Multi-agent AI orchestration framework with 313 MCP tools.',
    transport: PluginTransport.Stdio,
    installSource: 'catalog',
    serverCommand: 'npx',
    serverArgs: ['ruflo@latest', 'mcp', 'start'],
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    runtimeType: 'node',
    runtimeMinVersion: '20',
    homepageUrl: 'https://github.com/ruvnet/ruflo',
    createdAt: now,
    updatedAt: now,
  },
];

const onToggle = fn().mockName('onToggle');
const onRemove = fn().mockName('onRemove');
const onCheckHealth = fn().mockName('onCheckHealth');

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Default: Story = {
  args: {
    plugins: samplePlugins,
    onToggle,
    onRemove,
    onCheckHealth,
  },
};

export const Empty: Story = {
  args: {
    plugins: [],
    onToggle,
    onRemove,
    onCheckHealth,
  },
};

export const AllHealthy: Story = {
  args: {
    plugins: samplePlugins.map((p) => ({
      ...p,
      enabled: true,
      healthStatus: PluginHealthStatus.Healthy,
    })),
    onToggle,
    onRemove,
    onCheckHealth,
  },
};

export const SinglePlugin: Story = {
  args: {
    plugins: [samplePlugins[0]],
    onToggle,
    onRemove,
    onCheckHealth,
  },
};
