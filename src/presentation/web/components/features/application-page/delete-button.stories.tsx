import type { Meta, StoryObj } from '@storybook/react';

import { DeleteButton } from './delete-button';

const meta: Meta<typeof DeleteButton> = {
  title: 'ApplicationPage/DeleteButton',
  component: DeleteButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof DeleteButton>;

export const Default: Story = {
  args: { applicationId: 'app-001', applicationName: 'Example App' },
};

export const LongName: Story = {
  args: {
    applicationId: 'app-002',
    applicationName: 'Really Long Application Name That Wraps',
  },
};
