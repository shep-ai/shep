import type { Meta, StoryObj } from '@storybook/react';
import { WebhookRepoList } from './webhook-repo-list';

const mockWebhooks = [
  { repoFullName: 'acme/web-app', webhookId: 12345, repositoryPath: '/home/user/web-app' },
  { repoFullName: 'acme/api-service', webhookId: 12346, repositoryPath: '/home/user/api-service' },
  { repoFullName: 'acme/shared-lib', webhookId: 12347, repositoryPath: '/home/user/shared-lib' },
];

const meta: Meta<typeof WebhookRepoList> = {
  title: 'Features/Webhooks/WebhookRepoList',
  component: WebhookRepoList,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithWebhooks: Story = {
  args: {
    webhooks: mockWebhooks,
    tunnelUrl: 'https://random-subdomain.trycloudflare.com',
  },
};

export const Empty: Story = {
  args: {
    webhooks: [],
    tunnelUrl: null,
  },
};

export const SingleRepo: Story = {
  args: {
    webhooks: [mockWebhooks[0]],
    tunnelUrl: 'https://random-subdomain.trycloudflare.com',
  },
};
