import type { Meta, StoryObj } from '@storybook/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import {
  CLOUD_PROVIDER_BRAND_HEX,
  CLOUD_PROVIDER_ICONS,
  CloudflareIcon,
  GitHubIcon,
} from './cloud-provider-icons';

const meta: Meta<typeof CloudflareIcon> = {
  title: 'ApplicationPage/CloudProviderIcons',
  component: CloudflareIcon,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof CloudflareIcon>;

export const Cloudflare: Story = {
  args: {
    className: 'size-8',
    style: { color: CLOUD_PROVIDER_BRAND_HEX[CloudDeploymentProvider.CloudflarePages] },
  },
};

export const GitHub: Story = {
  render: () => <GitHubIcon className="size-8" />,
};

/** Every provider icon in its brand color, as the provider list shows it. */
export const AllProviders: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {Object.values(CloudDeploymentProvider).map((id) => {
        const Icon = CLOUD_PROVIDER_ICONS[id];
        return <Icon key={id} className="size-8" style={{ color: CLOUD_PROVIDER_BRAND_HEX[id] }} />;
      })}
    </div>
  ),
};
