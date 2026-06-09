import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpTelegramClient } from '@/infrastructure/services/messaging/http-telegram.client.js';

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpTelegramClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: HttpTelegramClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    client = new HttpTelegramClient(fetchMock as unknown as typeof fetch);
  });

  it('POSTs to api.telegram.org/bot{token}/sendMessage with chat_id and text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await client.sendMessage({
      botToken: '123:ABC',
      chatId: '@alice',
      text: 'hello',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:ABC/sendMessage');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      chat_id: '@alice',
      text: 'hello',
    });
  });

  it('includes parse_mode when specified', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await client.sendMessage({
      botToken: 't',
      chatId: '1',
      text: '*bold*',
      parseMode: 'MarkdownV2',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parse_mode).toBe('MarkdownV2');
  });

  it('throws with gateway description when the API returns non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: 'chat not found' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(client.sendMessage({ botToken: 't', chatId: 'x', text: 'y' })).rejects.toThrow(
      /400.*chat not found/
    );
  });

  it('rejects when botToken is missing', async () => {
    await expect(client.sendMessage({ botToken: '', chatId: '1', text: 't' })).rejects.toThrow(
      /botToken/
    );
  });

  it('rejects when chatId is missing', async () => {
    await expect(client.sendMessage({ botToken: 't', chatId: '', text: 't' })).rejects.toThrow(
      /chatId/
    );
  });
});
