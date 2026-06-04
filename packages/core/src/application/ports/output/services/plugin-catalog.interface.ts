/**
 * Plugin Catalog Interface
 *
 * Output port exposing the curated catalog of well-known AI-native tool
 * plugins that ship with Shep. The catalog is read-only metadata used to
 * power `shep plugin add <name>` and the web catalog browser.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides the concrete static catalog
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

/**
 * Service interface for reading the curated plugin catalog.
 */
export interface IPluginCatalog {
  /** Returns a copy of all curated catalog entries. */
  getEntries(): CatalogEntry[];

  /** Returns a single catalog entry by name, or undefined if not found. */
  getEntry(name: string): CatalogEntry | undefined;
}
