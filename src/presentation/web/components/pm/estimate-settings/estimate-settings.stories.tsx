import type { Meta, StoryObj } from '@storybook/react';
import { EstimateSettings } from './estimate-settings';
import { EstimateType } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof EstimateSettings> = {
  title: 'PM/EstimateSettings',
  component: EstimateSettings,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EstimateSettings>;

export const CategorySelected: Story = {
  args: {
    projectId: 'proj-1',
    currentEstimateType: EstimateType.Category,
  },
};

export const PointsSelected: Story = {
  args: {
    projectId: 'proj-1',
    currentEstimateType: EstimateType.Points,
  },
};

export const NoneSelected: Story = {
  args: {
    projectId: 'proj-1',
    currentEstimateType: EstimateType.None,
  },
};
