import type { Meta, StoryObj } from '@storybook/react';
import { ClusterCreateDrawer } from './cluster-create-drawer';

const meta: Meta<typeof ClusterCreateDrawer> = {
  title: 'Drawers/ClusterCreateDrawer',
  component: ClusterCreateDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ClusterCreateDrawer>;

export const Default: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    onSubmit: (): void => undefined,
  },
};

export const Loading: Story = {
  args: {
    open: true,
    onClose: (): void => undefined,
    onSubmit: (): void => undefined,
    loading: true,
  },
};

export const Closed: Story = {
  args: {
    open: false,
    onClose: (): void => undefined,
    onSubmit: (): void => undefined,
  },
};
