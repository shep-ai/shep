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

import { injectable } from 'tsyringe';
import { PluginType, PluginTransport } from '../../../domain/generated/output.js';
import type {
  CatalogEntry,
  IPluginCatalog,
} from '../../../application/ports/output/services/plugin-catalog.interface.js';

export type { CatalogEntry } from '../../../application/ports/output/services/plugin-catalog.interface.js';

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

/**
 * Static, in-memory implementation of the {@link IPluginCatalog} port backed
 * by the curated CATALOG array. Injected into plugin use cases via DI so the
 * application layer never imports infrastructure directly.
 */
@injectable()
export class StaticPluginCatalog implements IPluginCatalog {
  getEntries(): CatalogEntry[] {
    return getCatalogEntries();
  }

  getEntry(name: string): CatalogEntry | undefined {
    return getCatalogEntry(name);
  }
}
