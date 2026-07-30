/**
 * MCP Work Item Tools
 *
 * Registers project and work-item (task) management MCP tools on the server.
 * These expose shep's PM subsystem so AI agents can drive task management —
 * discovering projects and listing, inspecting, creating, updating, and
 * deleting work items. Each tool is a thin adapter that delegates to a use case.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type DependencyContainer from 'tsyringe/dist/typings/types/dependency-container.js';
import { z } from 'zod';
import { Priority } from '../../../../domain/generated/output.js';
import { ListPmProjectsUseCase } from '../../../../application/use-cases/pm-projects/list-pm-projects.use-case.js';
import { ListWorkItemsUseCase } from '../../../../application/use-cases/work-items/list-work-items.use-case.js';
import { GetWorkItemUseCase } from '../../../../application/use-cases/work-items/get-work-item.use-case.js';
import { CreateWorkItemUseCase } from '../../../../application/use-cases/work-items/create-work-item.use-case.js';
import { UpdateWorkItemUseCase } from '../../../../application/use-cases/work-items/update-work-item.use-case.js';
import { DeleteWorkItemUseCase } from '../../../../application/use-cases/work-items/delete-work-item.use-case.js';
import type { WorkItemFilter } from '../../../../application/ports/output/repositories/work-item-repository.interface.js';
import { withErrorHandling, type McpToolResult } from './with-error-handling.js';

/**
 * JSON text success response for MCP tools.
 */
function jsonResult(value: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/**
 * MCP error response carrying a message.
 */
function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const priorityEnum = z.enum([
  Priority.Urgent,
  Priority.High,
  Priority.Medium,
  Priority.Low,
  Priority.None,
]);

/**
 * Register project and work-item management MCP tools on the server.
 */
export function registerWorkItemTools(server: McpServer, container: DependencyContainer): void {
  server.registerTool(
    'list_projects',
    {
      description:
        'List all project-management projects tracked by shep. Use this to discover the projectId needed to list or create work items.',
      inputSchema: {},
    },
    async () => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ListPmProjectsUseCase);
        const projects = await useCase.execute();
        return jsonResult(projects);
      });
    }
  );

  server.registerTool(
    'list_work_items',
    {
      description:
        'List work items (tasks) in a project, optionally filtered by search text, priority, workflow state, or parent. Requires a projectId (see list_projects).',
      inputSchema: {
        projectId: z.string().describe('ID of the project to list work items from'),
        searchText: z.string().optional().describe('Full-text search across title and description'),
        priorities: z
          .array(priorityEnum)
          .optional()
          .describe('Filter by priority levels (Urgent, High, Medium, Low, None)'),
        stateIds: z.array(z.string()).optional().describe('Filter by workflow state IDs'),
        parentId: z
          .string()
          .optional()
          .describe('Filter by parent work item ID for sub-item hierarchy'),
      },
    },
    async ({ projectId, searchText, priorities, stateIds, parentId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(ListWorkItemsUseCase);
        const filters: WorkItemFilter = {};
        if (searchText !== undefined) filters.searchText = searchText;
        if (priorities !== undefined) filters.priorities = priorities;
        if (stateIds !== undefined) filters.stateIds = stateIds;
        if (parentId !== undefined) filters.parentId = parentId;
        const workItems = await useCase.execute(projectId, filters);
        return jsonResult(workItems);
      });
    }
  );

  server.registerTool(
    'get_work_item',
    {
      description:
        'Get a single work item by its UUID or project-scoped identifier (e.g. "PROJ-42").',
      inputSchema: {
        identifier: z.string().describe('Work item UUID or project identifier such as "PROJ-42"'),
      },
    },
    async ({ identifier }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(GetWorkItemUseCase);
        const result = await useCase.execute(identifier);
        if (!result.ok) {
          return errorResult(result.error);
        }
        return jsonResult(result.workItem);
      });
    }
  );

  server.registerTool(
    'create_work_item',
    {
      description:
        'Create a new work item (task) in a project. Requires a projectId and title. Returns the created work item.',
      inputSchema: {
        projectId: z.string().describe('ID of the project to create the work item in'),
        title: z.string().describe('Work item title'),
        description: z.string().optional().describe('Work item description'),
        priority: priorityEnum.optional().describe('Priority level (defaults to None)'),
        stateId: z
          .string()
          .optional()
          .describe('Workflow state ID (defaults to the project default state)'),
        parentId: z.string().optional().describe('Parent work item ID for sub-item hierarchy'),
      },
    },
    async ({ projectId, title, description, priority, stateId, parentId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(CreateWorkItemUseCase);
        const result = await useCase.execute({
          projectId,
          title,
          ...(description !== undefined ? { description } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(stateId !== undefined ? { stateId } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
        });
        if (!result.ok) {
          return errorResult(result.error);
        }
        return jsonResult(result.workItem);
      });
    }
  );

  server.registerTool(
    'update_work_item',
    {
      description:
        'Update mutable fields on an existing work item (title, description, workflow state, priority, or parent). Only provided fields are changed.',
      inputSchema: {
        workItemId: z.string().describe('UUID of the work item to update'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        stateId: z.string().optional().describe('New workflow state ID'),
        priority: priorityEnum.optional().describe('New priority level'),
        parentId: z.string().optional().describe('New parent work item ID'),
      },
    },
    async ({ workItemId, title, description, stateId, priority, parentId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(UpdateWorkItemUseCase);
        const result = await useCase.execute(workItemId, {
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(stateId !== undefined ? { stateId } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
        });
        if (!result.ok) {
          return errorResult(result.error);
        }
        return jsonResult({ ok: true, workItemId });
      });
    }
  );

  server.registerTool(
    'delete_work_item',
    {
      description: 'Delete (soft-delete) a work item by its UUID.',
      inputSchema: {
        workItemId: z.string().describe('UUID of the work item to delete'),
      },
    },
    async ({ workItemId }) => {
      return withErrorHandling(async () => {
        const useCase = container.resolve(DeleteWorkItemUseCase);
        const result = await useCase.execute(workItemId);
        if (!result.ok) {
          return errorResult(result.error);
        }
        return jsonResult({ ok: true, workItemId });
      });
    }
  );
}
