/**
 * MCP Command
 *
 * Starts the shep MCP (Model Context Protocol) server in foreground mode.
 * The server listens on stdio for JSON-RPC messages, exposing shep capabilities
 * as MCP tools that AI clients (Claude Desktop, Cursor, VS Code, etc.) can discover
 * and invoke.
 *
 * Usage: shep mcp [--log-level <level>]
 *
 * @example
 * $ shep mcp
 * # Server starts on stdio — configure your MCP client to spawn this process
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { messages } from '../ui/index.js';
import type { McpServerService } from '@/infrastructure/services/mcp/mcp-server.service.js';

/**
 * Create the mcp command
 */
export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start the MCP server for AI agent integration')
    .option(
      '--log-level <level>',
      'Logging verbosity for stderr output (debug, info, warn, error)',
      'warn'
    )
    .addHelpText(
      'after',
      `
Example Claude Desktop configuration (claude_desktop_config.json):
  {
    "mcpServers": {
      "shep": {
        "command": "shep",
        "args": ["mcp"]
      }
    }
  }

The MCP server communicates over stdio (stdin/stdout) using JSON-RPC.
All diagnostic output goes to stderr so it does not interfere with the protocol.`
    )
    .action(async (options: { logLevel: string }) => {
      try {
        // Set log level for stderr diagnostic output
        process.env.SHEP_MCP_LOG_LEVEL = options.logLevel;

        // Resolve and create the MCP server service via lazy factory
        const factory = container.resolve<() => Promise<McpServerService>>('McpServerFactory');
        const mcpServer = await factory();

        // Register signal handlers for graceful shutdown
        let isShuttingDown = false;
        const shutdown = async () => {
          if (isShuttingDown) return;
          isShuttingDown = true;
          await mcpServer.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Start the server — blocks on stdio transport
        await mcpServer.start();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to start MCP server', err);
        process.exitCode = 1;
      }
    });
}
