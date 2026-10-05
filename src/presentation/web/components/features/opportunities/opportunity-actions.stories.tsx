import type { Meta, StoryObj } from '@storybook/react';
import { OpportunityActions } from './opportunity-actions';
import { BUILDING, CHECKOUT, IDEA, OPTIONS, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof OpportunityActions> = {
  title: 'Features/Opportunities/OpportunityActions',
  component: OpportunityActions,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { projects: OPTIONS.projects, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Proposed: Story = { args: { opportunity: IDEA.opportunity } };

export const Accepted: Story = { args: { opportunity: CHECKOUT.opportunity } };

/** Without projects there is nowhere to build into. */
export const NoProjects: Story = { args: { opportunity: CHECKOUT.opportunity, projects: [] } };

/** Being built: it can be marked shipped by hand (spec 130). */
export const Building: Story = { args: { opportunity: BUILDING.opportunity } };
