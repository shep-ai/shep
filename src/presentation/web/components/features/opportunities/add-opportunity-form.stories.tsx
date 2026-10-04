import type { Meta, StoryObj } from '@storybook/react';
import { AddOpportunityForm } from './add-opportunity-form';
import { OPTIONS, runInStory } from './opportunities-fixtures';

const meta: Meta<typeof AddOpportunityForm> = {
  title: 'Features/Opportunities/AddOpportunityForm',
  component: AddOpportunityForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { spaceId: 'space-acme', run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithProductLines: Story = { args: { productLines: OPTIONS.productLines } };

export const SpaceWideOnly: Story = { args: { productLines: [] } };
