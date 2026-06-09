/**
 * @module Shep.Common.Enums.Plugin
 *
 * Defines enums for the AI Tool Plugin System.
 * Covers plugin integration types, MCP transport protocols,
 * and health check status indicators.
 */
/**
 * Plugin Integration Type
 *
 * Determines how a plugin integrates with Shep's agentic workflows.
 * Each type has a different lifecycle management strategy:
 *
 * - **Mcp**: MCP server plugins expose tools via Model Context Protocol.
 *   Shep spawns the server process and passes connection info to agent executors.
 * - **Hook**: Hook-based plugins integrate via Claude Code lifecycle hooks
 *   (.claude/hooks/ directory). Shep manages script installation, not execution.
 * - **Cli**: CLI tool plugins are standalone executables invoked during workflow steps.
 */
@doc("Integration type determining how a plugin connects to Shep workflows")
enum PluginType {
  @doc("MCP server plugin exposing tools via Model Context Protocol (stdio or HTTP)")
  Mcp,

  @doc("Hook-based plugin integrating via Claude Code lifecycle hooks")
  Hook,

  @doc("CLI tool plugin providing a standalone executable")
  Cli,
}

/**
 * MCP Transport Protocol
 *
 * Specifies the communication transport used by an MCP server plugin.
 * Only applicable when PluginType is Mcp.
 *
 * - **Stdio**: Communication via stdin/stdout pipes (most common for local MCP servers)
 * - **Http**: Communication via HTTP/SSE (for remote or networked MCP servers)
 */
@doc("Transport protocol for MCP server communication")
enum PluginTransport {
  @doc("Communication via stdin/stdout pipes (local MCP servers)")
  Stdio,

  @doc("Communication via HTTP/SSE (remote MCP servers)")
  Http,
}

/**
 * Plugin Health Status
 *
 * Indicates the operational health of a plugin based on multi-tier checks:
 * runtime availability, package installation, environment variables, and server probe.
 *
 * - **Healthy**: All health checks pass; plugin is fully operational
 * - **Degraded**: Runtime present but package or env var issues detected
 * - **Unavailable**: Runtime missing or critical failure prevents operation
 * - **Unknown**: Health has not been checked yet (initial state)
 */
@doc("Operational health status of a plugin based on multi-tier health checks")
enum PluginHealthStatus {
  @doc("All health checks pass; plugin is fully operational")
  Healthy,

  @doc("Runtime present but package or environment variable issues detected")
  Degraded,

  @doc("Runtime missing or critical failure prevents operation")
  Unavailable,

  @doc("Health has not been checked yet (initial state)")
  Unknown,
}
