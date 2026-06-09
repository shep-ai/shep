/**
 * MCP Settings Tools
 *
 * Registers settings-related MCP tools on the server.
 * Each tool is a thin adapter that delegates to a use case.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import { LoadSettingsUseCase } from '../../../../application/use-cases/settings/load-settings.use-case.js';
import { UpdateSettingsUseCase } from '../../../../application/use-cases/settings/update-settings.use-case.js';

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
 * Register settings-related MCP tools on the server.
 */
export function registerSettingsTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    'get_settings',
    {
      description:
        'Get the current shep settings including models, agent, environment, and workflow configuration.',
      inputSchema: {},
    },
    async () => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(LoadSettingsUseCase);
        const settings = await useCase.execute();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(settings, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'update_settings',
    {
      description:
        'Update shep settings. Pass the full settings object with desired changes. Returns the updated settings.',
      inputSchema: {
        settings: z
          .record(z.string(), z.unknown())
          .describe('Settings object with fields to update'),
      },
    },
    async ({ settings }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(UpdateSettingsUseCase);
        const updated = await useCase.execute(settings as never);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }],
        };
      });
    }
  );
}
