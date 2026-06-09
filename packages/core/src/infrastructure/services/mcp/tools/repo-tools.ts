/**
 * MCP Repository Tools
 *
 * Registers repository-related MCP tools on the server.
 * Each tool is a thin adapter that delegates to a use case.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { ListRepositoriesUseCase } from '../../../../application/use-cases/repositories/list-repositories.use-case.js';

/**
 * Wraps an async handler in try/catch, returning MCP error responses on failure.
 */
async function withErrorHandling(
  fn: () => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }
}

/**
 * Register repository-related MCP tools on the server.
 */
export function registerRepoTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    'list_repositories',
    {
      description: 'List all repositories tracked by shep.',
      inputSchema: {},
    },
    async () => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ListRepositoriesUseCase);
        const repositories = await useCase.execute();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(repositories, null, 2) }],
        };
      });
    }
  );
}
