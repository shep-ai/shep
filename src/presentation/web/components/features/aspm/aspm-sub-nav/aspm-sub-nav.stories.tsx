import type { Meta, StoryObj } from '@storybook/react';
import { AspmSubNav } from './aspm-sub-nav';

const meta: Meta<typeof AspmSubNav> = {
  title: 'Features/ASPM/AspmSubNav',
  component: AspmSubNav,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Default — Storybook's mocked pathname controls which tab appears active. */
export const Default: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/aspm' } },
  },
};

export const FindingsActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/aspm/findings' } },
  },
};

export const InventoryActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/aspm/inventory' } },
  },
};

export const AiReviewActive: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/aspm/ai-review' } },
  },
};
