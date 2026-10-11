import type { Meta, StoryObj } from '@storybook/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { ProviderDropdown } from './provider-dropdown';
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

const meta: Meta<typeof ProviderDropdown> = {
  title: 'ApplicationPage/ProviderDropdown',
  component: ProviderDropdown,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProviderDropdown>;

const noopSelect = () => undefined;
const defaultTrigger = <Button variant="outline">Deploy</Button>;

export const Default: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [CLOUDFLARE_CONNECTED],
    selectedProvider: null,
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const SelectedCloudflare: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [CLOUDFLARE_CONNECTED],
    selectedProvider: CloudDeploymentProvider.CloudflarePages,
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const NoneConnected: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [CLOUDFLARE_NOT_CONNECTED],
    selectedProvider: null,
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const WithEditTokenAffordance: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [CLOUDFLARE_CONNECTED],
    selectedProvider: CloudDeploymentProvider.CloudflarePages,
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
    onEditConnection: noopSelect,
  },
};

export const Loading: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [],
    selectedProvider: null,
    loading: true,
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const LoadError: Story = {
  args: {
    trigger: defaultTrigger,
    providers: [],
    selectedProvider: null,
    loadError: 'Failed to load providers',
    onSelectConnected: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};
