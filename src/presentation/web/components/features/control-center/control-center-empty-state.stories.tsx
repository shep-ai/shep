import type { Meta, StoryObj } from '@storybook/react';
import { ControlCenterEmptyState } from './control-center-empty-state';

const meta: Meta<typeof ControlCenterEmptyState> = {
  title: 'Features/ControlCenterEmptyState',
  component: ControlCenterEmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Prompt-first onboarding — the default view after agent setup */
export const Default: Story = {
  args: {},
};

/** With callback — for interaction testing */
export const WithCallback: Story = {
  args: {
    onRepositorySelect: (path: string) => {
      // eslint-disable-next-line no-console
      console.log('Selected repository:', path);
    },
    onApplicationCreated: (appId: string) => {
      // eslint-disable-next-line no-console
      console.log('Application created:', appId);
    },
  },
};

/** As overlay — with close button */
export const AsOverlay: Story = {
  args: {
    onClose: () => {
      // eslint-disable-next-line no-console
      console.log('Close clicked');
    },
    className: 'bg-background',
  },
};
