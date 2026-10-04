import type { Meta, StoryObj } from '@storybook/react';
import { TrackerIssueBadge } from './tracker-issue-badge';

const meta: Meta<typeof TrackerIssueBadge> = {
  title: 'Features/Trackers/TrackerIssueBadge',
  component: TrackerIssueBadge,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const LinearIssue: Story = {
  args: { issueKey: 'ENG-42', url: 'https://linear.app/acme/issue/ENG-42' },
};

export const JiraIssue: Story = {
  args: { issueKey: 'PAY-7', url: 'https://acme.atlassian.net/browse/PAY-7' },
};
