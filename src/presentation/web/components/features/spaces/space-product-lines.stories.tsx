import type { Meta, StoryObj } from '@storybook/react';
import { SpaceProductLines } from './space-product-lines';
import { ACME, PAYMENTS, PLATFORM, runInStory } from './spaces-fixtures';

const meta: Meta<typeof SpaceProductLines> = {
  title: 'Features/Spaces/SpaceProductLines',
  component: SpaceProductLines,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { space: ACME, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLines: Story = {
  args: { productLines: [PAYMENTS, PLATFORM] },
};

export const Empty: Story = {
  args: { productLines: [] },
};
