import type { Meta, StoryObj } from '@storybook/react';
import { WebhookDeliveryTable } from './webhook-delivery-table';
import type { WebhookDeliveryRecord } from './types';

const mockDeliveries: WebhookDeliveryRecord[] = [
  {
    deliveryId: 'abc-123-def',
    eventType: 'pull_request',
    source: 'github',
    receivedAt: new Date(Date.now() - 60000).toISOString(),
    status: 'success',
    statusMessage: 'Processed successfully',
    durationMs: 12,
    payload: {
      action: 'closed',
      pull_request: {
        number: 42,
        merged: true,
        html_url: 'https://github.com/acme/web-app/pull/42',
      },
    },
  },
  {
    deliveryId: 'abc-456-ghi',
    eventType: 'check_suite',
    source: 'github',
    receivedAt: new Date(Date.now() - 120000).toISOString(),
    status: 'success',
    statusMessage: 'Processed successfully',
    durationMs: 8,
    payload: {
      action: 'completed',
      check_suite: { conclusion: 'success', head_branch: 'feat/login' },
    },
  },
  {
    deliveryId: 'abc-789-jkl',
    eventType: 'check_run',
    source: 'github',
    receivedAt: new Date(Date.now() - 180000).toISOString(),
    status: 'error',
    statusMessage: 'Feature not found for branch refs/heads/unknown',
    durationMs: 3,
    payload: { action: 'completed', check_run: { conclusion: 'failure' } },
  },
  {
    deliveryId: 'abc-012-mno',
    eventType: 'ping',
    source: 'github',
    receivedAt: new Date(Date.now() - 240000).toISOString(),
    status: 'ignored',
    statusMessage: 'Unhandled event type: ping',
    durationMs: 0,
    payload: { zen: 'Keep it logically awesome.' },
  },
];

const meta: Meta<typeof WebhookDeliveryTable> = {
  title: 'Features/Webhooks/WebhookDeliveryTable',
  component: WebhookDeliveryTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDeliveries: Story = {
  args: { deliveries: mockDeliveries },
};

export const Empty: Story = {
  args: { deliveries: [] },
};

export const OnlyErrors: Story = {
  args: { deliveries: mockDeliveries.filter((d) => d.status === 'error') },
};
