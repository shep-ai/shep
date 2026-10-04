import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionProvider } from '@shepai/core/domain/generated/output';
import { AddSyncRuleForm } from './add-sync-rule-form';
import { PROJECTS, runInStory } from './trackers-fixtures';

const meta: Meta<typeof AddSyncRuleForm> = {
  title: 'Features/Trackers/AddSyncRuleForm',
  component: AddSyncRuleForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { connectionId: 'conn', projects: PROJECTS, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LinearTeam: Story = { args: { provider: ConnectionProvider.Linear } };

export const JiraQuery: Story = { args: { provider: ConnectionProvider.Jira } };

/** Rules write into a project, so there must be one first. */
export const NoProjects: Story = { args: { provider: ConnectionProvider.Linear, projects: [] } };
