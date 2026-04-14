import type { Meta, StoryObj } from '@storybook/react';
import { FeatureCards } from './feature-cards';

const meta: Meta<typeof FeatureCards> = {
  title: 'Landing/FeatureCards',
  component: FeatureCards,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
