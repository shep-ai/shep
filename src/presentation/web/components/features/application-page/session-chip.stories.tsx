import type { Meta, StoryObj } from '@storybook/react';

import { SessionChip } from './session-chip';

const meta: Meta<typeof SessionChip> = {
  title: 'ApplicationPage/SessionChip',
  component: SessionChip,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SessionChip>;

export const NoSession: Story = {
  args: { featureId: 'feat-app-001' },
};

export const WithPersistedSession: Story = {
  args: {
    featureId: 'feat-app-001',
    persistedSessionId: 'abc12345-6789-defg-hijk-lmnopqrstuvw',
  },
};
