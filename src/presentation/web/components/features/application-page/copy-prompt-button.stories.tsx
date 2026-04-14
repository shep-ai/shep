import type { Meta, StoryObj } from '@storybook/react';

import { CopyPromptButton } from './copy-prompt-button';

const meta: Meta<typeof CopyPromptButton> = {
  title: 'ApplicationPage/CopyPromptButton',
  component: CopyPromptButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof CopyPromptButton>;

export const Default: Story = {
  args: { applicationId: 'app-001' },
};

export const AltId: Story = {
  args: { applicationId: 'app-002' },
};
