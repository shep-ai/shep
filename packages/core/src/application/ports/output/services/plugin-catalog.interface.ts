/**
 * Plugin Catalog Port Interface
 *
 * Provides access to the curated catalog of well-known plugins.
 * The catalog is static data (no I/O), injected via DI to keep
 * the application layer free from infrastructure imports.
 */

import type {
  PluginType,
  PluginTransport,
  ToolGroup,
} from '../../../../domain/generated/output.js';

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

export interface IPluginCatalog {
  /** Returns all curated catalog entries. */
  getEntries(): CatalogEntry[];
  /** Returns a single entry by name, or undefined if not found. */
  getEntry(name: string): CatalogEntry | undefined;
}
