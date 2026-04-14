import type { Meta, StoryObj } from '@storybook/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { ProviderDropdown, type CloudProviderListEntry } from './provider-dropdown';

const ALL_PROVIDERS: CloudProviderListEntry[] = [
  {
    id: CloudDeploymentProvider.CloudflarePages,
    displayName: 'Cloudflare Pages',
    enabled: true,
    connected: true,
  },
  {
    id: CloudDeploymentProvider.Vercel,
    displayName: 'Vercel',
    enabled: true,
    connected: false,
  },
  {
    id: CloudDeploymentProvider.Netlify,
    displayName: 'Netlify',
    enabled: true,
    connected: false,
  },
  {
    id: CloudDeploymentProvider.AwsAmplify,
    displayName: 'AWS Amplify',
    enabled: false,
    connected: false,
  },
  {
    id: CloudDeploymentProvider.GcpCloudRun,
    displayName: 'Google Cloud Run',
    enabled: false,
    connected: false,
  },
];

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
    providers: ALL_PROVIDERS,
    selectedProvider: null,
    onSelectEnabled: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const SelectedCloudflare: Story = {
  args: {
    trigger: defaultTrigger,
    providers: ALL_PROVIDERS,
    selectedProvider: CloudDeploymentProvider.CloudflarePages,
    onSelectEnabled: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const AllDisabled: Story = {
  args: {
    trigger: defaultTrigger,
    providers: ALL_PROVIDERS.map((p) => ({ ...p, enabled: false, connected: false })),
    selectedProvider: null,
    onSelectEnabled: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const NoneConnected: Story = {
  args: {
    trigger: defaultTrigger,
    providers: ALL_PROVIDERS.map((p) => ({ ...p, connected: false })),
    selectedProvider: null,
    onSelectEnabled: noopSelect,
    onSelectDisconnected: noopSelect,
  },
};

export const WithEditTokenAffordance: Story = {
  args: {
    trigger: defaultTrigger,
    providers: ALL_PROVIDERS.map((p) =>
      p.id === CloudDeploymentProvider.CloudflarePages || p.id === CloudDeploymentProvider.Vercel
        ? { ...p, connected: true }
        : p
    ),
    selectedProvider: CloudDeploymentProvider.CloudflarePages,
    onSelectEnabled: noopSelect,
    onSelectDisconnected: noopSelect,
    onEditConnection: noopSelect,
  },
};
