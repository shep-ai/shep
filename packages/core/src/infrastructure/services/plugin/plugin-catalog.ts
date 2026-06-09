/**
 * Curated Plugin Catalog
 *
 * Static catalog of well-known AI-native tool plugins that ship with Shep.
 * Users can browse and install these by name (e.g., `shep plugin add mempalace`).
 *
 * Follows the TOOL_METADATA pattern in tool-metadata.ts:
 * type-safe, tree-shaken, no I/O required.
 *
 * To add a new catalog entry, append to the CATALOG array below.
 */

import { PluginType, PluginTransport, type ToolGroup } from '../../../domain/generated/output.js';

/**
 * Catalog entry describing a well-known plugin available for installation.
 */
export interface CatalogEntry {
  /** Unique plugin name used as identifier */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Integration type */
  type: PluginType;
  /** Brief description of what this plugin provides */
  description: string;
  /** Command to install the plugin package (e.g., 'pip install mempalace') */
  installCommand: string;
  /** Command to start the MCP server (MCP type only) */
  serverCommand?: string;
  /** Arguments for the server command (MCP type only) */
  serverArgs?: string[];
  /** MCP transport protocol (MCP type only) */
  transport?: PluginTransport;
  /** Environment variable names required by this plugin (names only, never values) */
  requiredEnvVars: string[];
  /** Available tool groups for selective activation */
  toolGroups?: ToolGroup[];
  /** Required runtime: 'python' or 'node' */
  runtimeType: string;
  /** Minimum runtime version (e.g., '3.9' for Python, '20' for Node.js) */
  runtimeMinVersion: string;
  /** Plugin homepage or repository URL */
  homepageUrl: string;
}

/**
 * V1 curated catalog entries.
 */
const CATALOG: readonly CatalogEntry[] = [
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
      {
        name: 'implement',
        description: 'Code implementation and generation tools',
      },
      {
        name: 'test',
        description: 'Testing and quality assurance tools',
      },
      {
        name: 'memory',
        description: 'Persistent memory and context management tools',
      },
      {
        name: 'flow',
        description: 'Workflow orchestration and agent coordination tools',
      },
    ],
    runtimeType: 'node',
    runtimeMinVersion: '20',
    homepageUrl: 'https://github.com/ruvnet/ruflo',
  },
];

/**
 * Returns a copy of all curated catalog entries.
 */
export function getCatalogEntries(): CatalogEntry[] {
  return [...CATALOG];
}

/**
 * Returns a single catalog entry by name, or undefined if not found.
 */
export function getCatalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.name === name);
}
