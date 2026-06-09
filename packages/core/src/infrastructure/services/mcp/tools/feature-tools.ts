/**
 * MCP Feature Tools
 *
 * Registers feature-related MCP tools on the server.
 * Each tool is a thin adapter that delegates to a use case.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import { ListFeaturesUseCase } from '../../../../application/use-cases/features/list-features.use-case.js';
import { ShowFeatureUseCase } from '../../../../application/use-cases/features/show-feature.use-case.js';
import { CreateFeatureUseCase } from '../../../../application/use-cases/features/create/create-feature.use-case.js';
import { StartFeatureUseCase } from '../../../../application/use-cases/features/start-feature.use-case.js';
import { SdlcLifecycle } from '../../../../domain/generated/output.js';
import type { FeatureListFilters } from '../../../../application/ports/output/repositories/feature-repository.interface.js';

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
 * Register feature-related MCP tools on the server.
 */
export function registerFeatureTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    'list_features',
    {
      description:
        'List all features tracked by shep. Optionally filter by lifecycle status (e.g. Pending, Implementation, Review).',
      inputSchema: {
        status: z
          .enum([
            SdlcLifecycle.Started,
            SdlcLifecycle.Analyze,
            SdlcLifecycle.Requirements,
            SdlcLifecycle.Research,
            SdlcLifecycle.Planning,
            SdlcLifecycle.Implementation,
            SdlcLifecycle.Review,
            SdlcLifecycle.Maintain,
            SdlcLifecycle.Blocked,
            SdlcLifecycle.Pending,
          ])
          .optional()
          .describe('Filter by lifecycle status'),
      },
    },
    async ({ status }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ListFeaturesUseCase);
        const filters: FeatureListFilters = {};
        if (status) {
          filters.lifecycle = status as SdlcLifecycle;
        }
        const features = await useCase.execute(filters);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(features, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'show_feature',
    {
      description:
        'Get detailed information about a feature by ID. Supports prefix matching — you can provide the first few characters of the feature ID.',
      inputSchema: {
        featureId: z.string().describe('Feature ID or ID prefix'),
      },
    },
    async ({ featureId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ShowFeatureUseCase);
        const feature = await useCase.execute(featureId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(feature, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'create_feature',
    {
      description:
        'Create a new feature in shep. Requires a user input describing the feature and the repository path. Optionally provide a name and description to skip AI metadata extraction.',
      inputSchema: {
        userInput: z.string().describe('Natural language description of the feature to create'),
        repositoryPath: z.string().describe('Absolute path to the repository'),
        name: z.string().optional().describe('Pre-supplied feature name (skips AI extraction)'),
        description: z
          .string()
          .optional()
          .describe('Pre-supplied feature description (skips AI extraction)'),
        pending: z
          .boolean()
          .optional()
          .describe('When true, create in Pending state without spawning an agent'),
      },
    },
    async ({ userInput, repositoryPath, name, description, pending }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(CreateFeatureUseCase);
        const result = await useCase.execute({
          userInput,
          repositoryPath,
          name,
          description,
          pending,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'start_feature',
    {
      description:
        'Start a pending feature. Triggers an agent run and returns the run ID immediately without blocking.',
      inputSchema: {
        featureId: z.string().describe('ID of the pending feature to start'),
      },
    },
    async ({ featureId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(StartFeatureUseCase);
        const result = await useCase.execute(featureId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      });
    }
  );
}
