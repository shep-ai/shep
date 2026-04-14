import type { Meta, StoryObj } from '@storybook/react';
import { TrustSignals } from './trust-signals';

const meta: Meta<typeof TrustSignals> = {
  title: 'Landing/TrustSignals',
  component: TrustSignals,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
