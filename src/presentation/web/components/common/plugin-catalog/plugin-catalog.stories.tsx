import { fn } from '@storybook/test';
import type { Meta, StoryObj } from '@storybook/react';
import { PluginType, PluginTransport } from '@shepai/core/domain/generated/output';
import type { CatalogEntryWithStatus } from '@shepai/core/application/use-cases/plugins/get-plugin-catalog.use-case';
import { PluginCatalog } from './plugin-catalog';

const meta = {
  title: 'Common/PluginCatalog',
  component: PluginCatalog,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PluginCatalog>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ---------------------------------------------------------------------------
 * Data fixtures
 * ------------------------------------------------------------------------- */

const catalogEntries: CatalogEntryWithStatus[] = [
  {
    name: 'mempalace',
    displayName: 'MemPalace',
    type: PluginType.Mcp,
    description:
      'Local AI memory system with persistent knowledge storage. Provides 19 MCP tools for managing long-term memory across AI sessions.',
    installCommand: 'pip install mempalace',
    serverCommand: 'python',
    serverArgs: ['-m', 'mempalace.mcp_server'],
    transport: PluginTransport.Stdio,
    requiredEnvVars: [],
    runtimeType: 'python',
    runtimeMinVersion: '3.9',
    homepageUrl: 'https://github.com/MemPalace/mempalace',
    isInstalled: false,
  },
  {
    name: 'token-optimizer',
    displayName: 'Token Optimizer',
    type: PluginType.Hook,
    description:
      'Token waste reduction and context management via Claude Code lifecycle hooks. Optimizes token usage across sessions without requiring MCP.',
    installCommand: 'pip install token-optimizer',
    requiredEnvVars: [],
    runtimeType: 'python',
    runtimeMinVersion: '3.8',
    homepageUrl: 'https://github.com/alexgreensh/token-optimizer',
    isInstalled: false,
  },
  {
    name: 'ruflo',
    displayName: 'Ruflo',
    type: PluginType.Mcp,
    description:
      'Multi-agent AI orchestration framework with 313 MCP tools. Provides specialized agents for implementation, testing, memory, and workflow orchestration.',
    installCommand: 'npm install -g ruflo@latest',
    serverCommand: 'npx',
    serverArgs: ['ruflo@latest', 'mcp', 'start'],
    transport: PluginTransport.Stdio,
    requiredEnvVars: ['ANTHROPIC_API_KEY'],
    toolGroups: [
      { name: 'implement', description: 'Code implementation and generation tools' },
      { name: 'test', description: 'Testing and quality assurance tools' },
      { name: 'memory', description: 'Persistent memory and context management tools' },
      { name: 'flow', description: 'Workflow orchestration and agent coordination tools' },
    ],
    runtimeType: 'node',
    runtimeMinVersion: '20',
    homepageUrl: 'https://github.com/ruvnet/ruflo',
    isInstalled: false,
  },
];

const onInstall = fn().mockName('onInstall');

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const AllAvailable: Story = {
  args: {
    catalog: catalogEntries,
    onInstall,
  },
};

export const OneInstalled: Story = {
  args: {
    catalog: catalogEntries.map((entry) =>
      entry.name === 'mempalace' ? { ...entry, isInstalled: true } : entry
    ),
    onInstall,
  },
};

export const AllInstalled: Story = {
  args: {
    catalog: catalogEntries.map((entry) => ({ ...entry, isInstalled: true })),
    onInstall,
  },
};
