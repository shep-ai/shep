import type { Meta, StoryObj } from '@storybook/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { ConnectProviderModal } from './connect-provider-modal';

const meta: Meta<typeof ConnectProviderModal> = {
  title: 'ApplicationPage/ConnectProviderModal',
  component: ConnectProviderModal,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ConnectProviderModal>;

const noopClose = () => undefined;
const noopSubmit = async () => undefined;

export const Cloudflare: Story = {
  args: {
    provider: CloudDeploymentProvider.CloudflarePages,
    onClose: noopClose,
    onSubmit: noopSubmit,
  },
};

export const Vercel: Story = {
  args: {
    provider: CloudDeploymentProvider.Vercel,
    onClose: noopClose,
    onSubmit: noopSubmit,
  },
};

export const Closed: Story = {
  args: {
    provider: null,
    onClose: noopClose,
    onSubmit: noopSubmit,
  },
};

export const SubmitError: Story = {
  args: {
    provider: CloudDeploymentProvider.Netlify,
    onClose: noopClose,
    onSubmit: async () => {
      throw new Error('Invalid API token');
    },
  },
};
