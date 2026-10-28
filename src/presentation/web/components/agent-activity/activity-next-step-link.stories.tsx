import type { Meta, StoryObj } from '@storybook/react';
import { ActivityNextStepLink } from './activity-next-step-link';

const meta: Meta<typeof ActivityNextStepLink> = {
  title: 'Composed/AgentActivity/ActivityNextStepLink',
  component: ActivityNextStepLink,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { step: { labelKey: 'answer', href: '/agent-questions?feature=feat-51aa90e2' } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReviewGate: Story = {
  args: { step: { labelKey: 'review', href: '/feature/feat-8b21d004' } },
};

export const PullRequest: Story = {
  args: {
    step: { labelKey: 'openPr', href: 'https://github.com/acme/web/pull/42', external: true },
  },
};

export const Resume: Story = {
  args: { step: { labelKey: 'resume', href: '/feature/feat-e4402b13' } },
};
