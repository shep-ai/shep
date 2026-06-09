/**
 * MCP Server Service
 *
 * Thin presentation adapter that exposes shep use cases as MCP tools.
 * Uses the official @modelcontextprotocol/sdk with stdio transport.
 *
 * Architecture: This sits in the infrastructure layer as a presentation adapter,
 * the same pattern used by CLI commands and the web server. It resolves use cases
 * from the shared DI container and contains zero business logic.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { registerAllTools } from './tools/index.js';

export class McpServerService {
  public readonly server: McpServer;

  constructor(version: string, container?: DependencyContainer) {
    this.server = new McpServer({
      name: 'shep',
      version,
    });

    if (container) {
      registerAllTools(this.server, container);
    }
  }

  /**
   * Connect the MCP server to a stdio transport and start listening.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /**
   * Close the MCP server and transport.
   */
  async stop(): Promise<void> {
    await this.server.close();
  }
}
