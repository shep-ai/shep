import type { Meta, StoryObj } from '@storybook/react';
import { ConnectionProvider } from '@shepai/core/domain/generated/output';
import { SyncRulesSection } from './sync-rules-section';
import { FAILING_RULE, JIRA_RULE, PROJECTS, runInStory } from './trackers-fixtures';

const meta: Meta<typeof SyncRulesSection> = {
  title: 'Features/Trackers/SyncRulesSection',
  component: SyncRulesSection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    connectionId: 'conn-jira',
    provider: ConnectionProvider.Jira,
    projects: PROJECTS,
    run: runInStory,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRules: Story = { args: { rules: [JIRA_RULE, FAILING_RULE] } };

export const Empty: Story = { args: { rules: [] } };

/** No projects yet: rules need a project to write into. */
export const NoProjects: Story = { args: { rules: [], projects: [] } };
