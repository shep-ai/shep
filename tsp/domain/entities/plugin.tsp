/**
 * @module Shep.Domain.Entities.Plugin
 *
 * Defines the Plugin entity and ToolGroup model for the AI Tool Plugin System.
 * A Plugin represents an external AI-native tool that integrates into Shep's
 * agentic workflows via one of three integration types: MCP server, hook-based,
 * or CLI tool.
 *
 * ## Entity Relationships
 *
 * ```
 * +------------------------------------------------------------------+
 * |                     PLUGIN (Entity)                               |
 * +------------------------------------------------------------------+
 * | id: UUID                                                          |
 * | name: string (unique)                                             |
 * | displayName: string                                               |
 * | type: PluginType (Mcp | Hook | Cli)                              |
 * | enabled: boolean                                                  |
 * | healthStatus: PluginHealthStatus                                  |
 * +------------------------------------------------------------------+
 *            |
 *            | 0..*
 *            v
 *     +------------------+
 *     |    ToolGroup     |
 *     +------------------+
 *     | name: string     |
 *     | description?     |
 *     | tools?: string[] |
 *     +------------------+
 * ```
 *
 * ## Plugin Types
 *
 * - **Mcp**: MCP server plugins (MemPalace, Ruflo) expose tools via Model Context Protocol.
 *   Uses transport (Stdio/Http), serverCommand, and serverArgs fields.
 * - **Hook**: Hook-based plugins (Token Optimizer) integrate via Claude Code lifecycle hooks.
 *   Uses hookType and scriptPath fields.
 * - **Cli**: CLI tool plugins provide standalone executables.
 *   Uses binaryCommand field.
 *
 * Type-specific fields are optional; only those matching the plugin's type are populated.
 *
 * @see common/enums/plugin.tsp - PluginType, PluginTransport, PluginHealthStatus enums
 * @see common/base.tsp - BaseEntity base class
 */
import "../../common/base.tsp";
import "../../common/enums/plugin.tsp";

/**
 * Tool Group
 *
 * Represents a logical grouping of MCP tools within a plugin. Used for
 * filtering which tools from a large plugin (e.g., Ruflo with 313 tools)
 * are made available to the agent executor.
 *
 * ## Properties
 *
 * | Property    | Type     | Required | Description                                 |
 * |-------------|----------|----------|---------------------------------------------|
 * | name        | string   | Yes      | Group identifier (e.g., "implement", "test")|
 * | description | string   | No       | Human-readable description of the group     |
 * | tools       | string[] | No       | List of tool names belonging to this group   |
 *
 * @example
 * ```json
 * {
 *   "name": "implement",
 *   "description": "Tools for code implementation and file operations",
 *   "tools": ["write_file", "read_file", "execute_command"]
 * }
 * ```
 */
@doc("Logical grouping of MCP tools within a plugin for selective activation")
model ToolGroup {
  @doc("Group identifier used for activation and filtering")
  name: string;

  @doc("Human-readable description of what this tool group provides")
  description?: string;

  @doc("List of individual tool names belonging to this group")
  tools?: string[];
}

/**
 * Plugin Entity
 *
 * Represents an external AI-native tool registered in Shep's plugin system.
 * The plugin entity uses a type discriminator pattern: fields specific to
 * a plugin type (Mcp, Hook, Cli) are optional and only populated when
 * the type matches.
 *
 * ## Properties
 *
 * | Property          | Type               | Required | Description                                    |
 * |-------------------|--------------------|----------|------------------------------------------------|
 * | id                | UUID               | Yes      | Unique identifier (from BaseEntity)            |
 * | name              | string             | Yes      | Unique plugin name (e.g., "mempalace")         |
 * | displayName       | string             | Yes      | Human-readable display name                    |
 * | type              | PluginType         | Yes      | Integration type: Mcp, Hook, or Cli            |
 * | version           | string             | No       | Installed version of the plugin                |
 * | installSource     | string             | No       | Source: "catalog" or "custom"                  |
 * | transport         | PluginTransport    | No       | MCP transport protocol (Mcp type only)         |
 * | serverCommand     | string             | No       | Command to start MCP server (Mcp type only)    |
 * | serverArgs        | string[]           | No       | Arguments for server command (Mcp type only)   |
 * | requiredEnvVars   | string[]           | No       | Environment variable names required by plugin  |
 * | toolGroups        | ToolGroup[]        | No       | Available tool groups for filtering            |
 * | activeToolGroups  | string[]           | No       | Currently enabled tool group names             |
 * | enabled           | boolean            | Yes      | Global enabled/disabled state (default: true)  |
 * | healthStatus      | PluginHealthStatus | Yes      | Current health status (default: Unknown)       |
 * | healthMessage     | string             | No       | Human-readable health check details            |
 * | hookType          | string             | No       | Hook event type (Hook type only)               |
 * | scriptPath        | string             | No       | Path to hook script (Hook type only)           |
 * | binaryCommand     | string             | No       | Executable command (Cli type only)             |
 * | runtimeType       | string             | No       | Required runtime: "python" or "node"           |
 * | runtimeMinVersion | string             | No       | Minimum runtime version (e.g., "3.9", "20")   |
 * | homepageUrl       | string             | No       | Plugin homepage or repository URL              |
 * | description       | string             | No       | Brief description of what the plugin does      |
 * | createdAt         | utcDateTime        | Yes      | When registered (from BaseEntity)              |
 * | updatedAt         | utcDateTime        | Yes      | When last modified (from BaseEntity)           |
 *
 * @example
 * ```json
 * {
 *   "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "name": "mempalace",
 *   "displayName": "MemPalace",
 *   "type": "Mcp",
 *   "transport": "Stdio",
 *   "serverCommand": "python",
 *   "serverArgs": ["-m", "mempalace.mcp_server"],
 *   "requiredEnvVars": [],
 *   "enabled": true,
 *   "healthStatus": "Healthy",
 *   "runtimeType": "python",
 *   "runtimeMinVersion": "3.9",
 *   "installSource": "catalog"
 * }
 * ```
 */
@doc("External AI-native tool registered in Shep's plugin system")
model Plugin extends BaseEntity {
  @doc("Unique plugin name used as identifier (e.g., 'mempalace', 'ruflo')")
  name: string;

  @doc("Human-readable display name for UI presentation")
  displayName: string;

  @doc("Integration type determining how the plugin connects to Shep workflows")
  type: PluginType;

  @doc("Installed version of the plugin package")
  version?: string;

  @doc("Installation source: 'catalog' for curated plugins, 'custom' for user-added")
  installSource?: string;

  // ── MCP-specific fields ────────────────────────────────────

  @doc("MCP transport protocol (only for Mcp type plugins)")
  transport?: PluginTransport;

  @doc("Command to start the MCP server process (only for Mcp type plugins)")
  serverCommand?: string;

  @doc("Arguments passed to the MCP server command (only for Mcp type plugins)")
  serverArgs?: string[];

  // ── Tool filtering ─────────────────────────────────────────

  @doc("Environment variable names required by this plugin (names only, never values)")
  requiredEnvVars?: string[];

  @doc("Available tool groups defined by this plugin for selective activation")
  toolGroups?: ToolGroup[];

  @doc("Names of currently enabled tool groups from the available set")
  activeToolGroups?: string[];

  // ── Status ─────────────────────────────────────────────────

  @doc("Whether this plugin is globally enabled for use in features")
  enabled: boolean = true;

  @doc("Current operational health status based on multi-tier health checks")
  healthStatus: PluginHealthStatus = PluginHealthStatus.Unknown;

  @doc("Human-readable details from the most recent health check")
  healthMessage?: string;

  // ── Hook-specific fields ───────────────────────────────────

  @doc("Hook event type for lifecycle integration (only for Hook type plugins)")
  hookType?: string;

  @doc("Path to the hook script file (only for Hook type plugins)")
  scriptPath?: string;

  // ── CLI-specific fields ────────────────────────────────────

  @doc("Executable command for CLI tool invocation (only for Cli type plugins)")
  binaryCommand?: string;

  // ── Runtime requirements ───────────────────────────────────

  @doc("Required runtime environment: 'python' or 'node'")
  runtimeType?: string;

  @doc("Minimum required version of the runtime (e.g., '3.9' for Python, '20' for Node.js)")
  runtimeMinVersion?: string;

  // ── Metadata ───────────────────────────────────────────────

  @doc("Plugin homepage or repository URL for reference")
  homepageUrl?: string;

  @doc("Brief description of what this plugin provides")
  description?: string;
}
