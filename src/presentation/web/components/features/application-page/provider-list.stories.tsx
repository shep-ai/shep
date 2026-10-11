import type { Meta, StoryObj } from '@storybook/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { ProviderList } from './provider-list';
import type { CloudProviderListEntry } from './cloud-providers';

const CLOUDFLARE_CONNECTED: CloudProviderListEntry = {
  id: CloudDeploymentProvider.CloudflarePages,
  displayName: 'Cloudflare Pages',
  connected: true,
};

const CLOUDFLARE_NOT_CONNECTED: CloudProviderListEntry = {
  ...CLOUDFLARE_CONNECTED,
  connected: false,
};

const noop = () => undefined;

const meta: Meta<typeof ProviderList> = {
  title: 'ApplicationPage/ProviderList',
  component: ProviderList,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
  args: {
    selectedProvider: null,
    onSelectConnected: noop,
    onSelectDisconnected: noop,
  },
};

export default meta;
type Story = StoryObj<typeof ProviderList>;

export const Connected: Story = {
  args: {
    providers: [CLOUDFLARE_CONNECTED],
    selectedProvider: CloudDeploymentProvider.CloudflarePages,
    onEditConnection: noop,
  },
};

export const NotConnected: Story = {
  args: {
    providers: [CLOUDFLARE_NOT_CONNECTED],
  },
};

export const Loading: Story = {
  args: {
    providers: [],
    loading: true,
  },
};

export const LoadError: Story = {
  args: {
    providers: [],
    loadError: 'Failed to load providers',
  },
};
