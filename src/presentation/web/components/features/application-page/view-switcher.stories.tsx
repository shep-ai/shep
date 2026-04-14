import type { Meta, StoryObj } from '@storybook/react';

import { ViewSwitcher } from './view-switcher';

const meta: Meta<typeof ViewSwitcher> = {
  title: 'ApplicationPage/ViewSwitcher',
  component: ViewSwitcher,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ViewSwitcher>;

export const IdeActive: Story = {
  args: { active: 'ide', onChange: () => undefined },
};

export const WebDisabled: Story = {
  args: { active: 'ide', onChange: () => undefined, disabledTabs: ['web'] },
};
