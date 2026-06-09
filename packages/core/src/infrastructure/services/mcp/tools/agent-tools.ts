/**
 * MCP Agent Tools
 *
 * Registers agent-related MCP tools on the server.
 * Each tool is a thin adapter that delegates to a use case.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import { RunAgentUseCase } from '../../../../application/use-cases/agents/run-agent.use-case.js';
import { GetAgentRunUseCase } from '../../../../application/use-cases/agents/get-agent-run.use-case.js';
import { ListAgentRunsUseCase } from '../../../../application/use-cases/agents/list-agent-runs.use-case.js';
import { StopAgentRunUseCase } from '../../../../application/use-cases/agents/stop-agent-run.use-case.js';

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
 * Register agent-related MCP tools on the server.
 */
export function registerAgentTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    'run_agent',
    {
      description:
        'Run a named agent with a prompt. Returns the agent run ID immediately without blocking — use show_agent_run to poll for status.',
      inputSchema: {
        agentName: z.string().describe('Name of the agent to run'),
        prompt: z.string().describe('Prompt or instructions for the agent'),
      },
    },
    async ({ agentName, prompt }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(RunAgentUseCase);
        const agentRun = await useCase.execute({ agentName, prompt });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(agentRun, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'show_agent_run',
    {
      description: 'Get the status and details of an agent run by its ID.',
      inputSchema: {
        runId: z.string().describe('Agent run ID'),
      },
    },
    async ({ runId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(GetAgentRunUseCase);
        const agentRun = await useCase.execute(runId);
        if (!agentRun) {
          return {
            content: [{ type: 'text' as const, text: `Agent run not found: "${runId}"` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(agentRun, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'list_agent_runs',
    {
      description: 'List all agent runs, sorted by most recent first.',
      inputSchema: {},
    },
    async () => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ListAgentRunsUseCase);
        const runs = await useCase.execute();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(runs, null, 2) }],
        };
      });
    }
  );

  server.registerTool(
    'stop_agent_run',
    {
      description: 'Stop a running agent by its run ID. Returns whether the stop was successful.',
      inputSchema: {
        runId: z.string().describe('Agent run ID to stop'),
      },
    },
    async ({ runId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(StopAgentRunUseCase);
        const result = await useCase.execute(runId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      });
    }
  );
}
