import type { Meta, StoryObj } from '@storybook/react';
import { InvestigationPanel } from './investigation-panel';
import {
  APPROVED_INVESTIGATION,
  COMPLETED_INVESTIGATION,
  FAILED_INVESTIGATION,
  PENDING_INVESTIGATION,
  SAMPLE_REPOSITORIES,
} from './bug-loop-fixtures';

const meta: Meta<typeof InvestigationPanel> = {
  title: 'Features/BugLoop/InvestigationPanel',
  component: InvestigationPanel,
  args: { workItemId: 'item-1', repositories: SAMPLE_REPOSITORIES },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof InvestigationPanel>;

/** Never investigated: pick a repository and start. */
export const Default: Story = {};
export const NoRepositories: Story = { args: { repositories: [] } };
export const Running: Story = { args: { initialInvestigation: PENDING_INVESTIGATION } };
export const Completed: Story = { args: { initialInvestigation: COMPLETED_INVESTIGATION } };
export const Failed: Story = { args: { initialInvestigation: FAILED_INVESTIGATION } };
export const Approved: Story = { args: { initialInvestigation: APPROVED_INVESTIGATION } };
