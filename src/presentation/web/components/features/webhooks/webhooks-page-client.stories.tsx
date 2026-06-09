import type { Meta, StoryObj } from '@storybook/react';
import { WebhooksPageClient } from './webhooks-page-client';
import type { WebhookSystemStatus } from './types';

const activeStatus: WebhookSystemStatus = {
  running: true,
  tunnel: {
    connected: true,
    publicUrl: 'https://random-subdomain.trycloudflare.com',
  },
  webhooks: {
    registered: [
      { repoFullName: 'acme/web-app', webhookId: 12345, repositoryPath: '/home/user/web-app' },
      {
        repoFullName: 'acme/api-service',
        webhookId: 12346,
        repositoryPath: '/home/user/api-service',
      },
    ],
    totalDeliveries: 15,
    successCount: 12,
    errorCount: 1,
    ignoredCount: 2,
  },
  startedAt: new Date(Date.now() - 7200000).toISOString(),
};

const inactiveStatus: WebhookSystemStatus = {
  running: false,
  tunnel: { connected: false, publicUrl: null },
  webhooks: {
    registered: [],
    totalDeliveries: 0,
    successCount: 0,
    errorCount: 0,
    ignoredCount: 0,
  },
  startedAt: null,
};

const meta: Meta<typeof WebhooksPageClient> = {
  title: 'Features/Webhooks/WebhooksPageClient',
  component: WebhooksPageClient,
  parameters: {
    layout: 'padded',
    mockData: [
      { url: '/api/webhooks/status', method: 'GET', status: 200, response: activeStatus },
      {
        url: '/api/webhooks/deliveries?limit=100',
        method: 'GET',
        status: 200,
        response: { deliveries: [] },
      },
    ],
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { initialStatus: activeStatus },
};

export const Inactive: Story = {
  args: { initialStatus: inactiveStatus },
};
