import type { Meta, StoryObj } from '@storybook/react';
import { NewFeatureButton } from './new-feature-button';

const meta: Meta<typeof NewFeatureButton> = {
  title: 'Common/NewFeatureButton',
  component: NewFeatureButton,
  args: {
    onClick: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof NewFeatureButton>;

export const Default: Story = {};
