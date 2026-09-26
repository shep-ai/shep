import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { WebhookStatusCards } from '@/components/features/webhooks/webhook-status-cards';
import type { WebhookSystemStatus } from '@/components/features/webhooks/types';

const STARTED_AT = Date.UTC(2026, 8, 26, 10, 0, 0);

const status: WebhookSystemStatus = {
  running: true,
  tunnel: { connected: true, publicUrl: 'https://tunnel.example' },
  webhooks: {
    registered: [],
    totalDeliveries: 0,
    successCount: 0,
    errorCount: 0,
    ignoredCount: 0,
  },
  startedAt: new Date(STARTED_AT).toISOString(),
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('WebhookStatusCards hydration', () => {
  it('hydrates without a mismatch when the uptime ticks between server and client render', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(STARTED_AT + 62_000); // server renders "1m 2s"
    const container = document.createElement('div');
    container.innerHTML = renderToString(<WebhookStatusCards status={status} />);
    document.body.appendChild(container);

    now.mockReturnValue(STARTED_AT + 63_000); // client renders "1m 3s"
    const recoverableErrors: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await act(async () => {
      hydrateRoot(container, <WebhookStatusCards status={status} />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
    });

    expect(recoverableErrors).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    // React keeps the server's text for a suppressed mismatch.
    expect(container).toHaveTextContent('Up for 1m 2s');
  });
});
