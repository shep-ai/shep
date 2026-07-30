import type { Meta, StoryObj } from '@storybook/react';
import { McpIntegrationSection } from './mcp-integration-section';

const meta = {
  title: 'Features/Settings/McpIntegrationSection',
  component: McpIntegrationSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof McpIntegrationSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: the full shep MCP tool catalog with the new task-management tools badged. */
export const Default: Story = {};

/** A custom spawn command (e.g. running the CLI via a local dev binary). */
export const CustomCommand: Story = {
  args: {
    command: 'pnpm dev:cli mcp',
  },
};

/** Only the task-management tools — useful for focused documentation. */
export const TaskToolsOnly: Story = {
  args: {
    toolGroups: [
      {
        category: 'Task management',
        tools: [
          { name: 'list_projects', description: 'Discover projects and their IDs', isNew: true },
          {
            name: 'list_work_items',
            description: 'List tasks in a project with filters',
            isNew: true,
          },
          {
            name: 'get_work_item',
            description: 'Fetch a task by UUID or PROJ-42 identifier',
            isNew: true,
          },
          { name: 'create_work_item', description: 'Create a task in a project', isNew: true },
          { name: 'update_work_item', description: 'Update a task’s fields', isNew: true },
          { name: 'delete_work_item', description: 'Delete (soft-delete) a task', isNew: true },
        ],
      },
    ],
  },
};
