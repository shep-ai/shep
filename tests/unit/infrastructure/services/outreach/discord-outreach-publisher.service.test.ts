/**
 * DiscordOutreachPublisher — unit tests
 *
 * Asserts that:
 *   - Posts go to /channels/{id}/messages
 *   - Bot token lands in the Authorization header as `Bot <token>`
 *   - The bot token NEVER appears in any log output (stdout/stderr)
 *   - Adapter throws OutreachPublisherError on missing-token / non-2xx
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  DiscordOutreachPublisher,
  type DiscordHttpFetch,
} from '@/infrastructure/services/outreach/discord-outreach-publisher.service.js';
import { OutreachPublisherError } from '@/application/ports/output/services/outreach-publisher.interface.js';

const TOKEN = 'super-secret-bot-token-9999';
const CHANNEL = '1234567890';

function makeFetch(response: { ok: boolean; status?: number; body?: unknown }): DiscordHttpFetch {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    text: async () => JSON.stringify(response.body ?? {}),
    json: async () => response.body ?? {},
  });
}

describe('DiscordOutreachPublisher', () => {
  let logSpy: Mock;
  let warnSpy: Mock;
  let errSpy: Mock;

  beforeEach(() => {
    logSpy = vi.fn();
    warnSpy = vi.fn();
    errSpy = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(logSpy as never);
    vi.spyOn(console, 'warn').mockImplementation(warnSpy as never);
    vi.spyOn(console, 'error').mockImplementation(errSpy as never);
    vi.spyOn(console, 'info').mockImplementation(logSpy as never);
    vi.spyOn(console, 'debug').mockImplementation(logSpy as never);
  });

  it('POSTs to /channels/{id}/messages with the Discord bot Authorization header', async () => {
    const fetchFn = makeFetch({
      ok: true,
      body: { id: 'msg-1', timestamp: '2026-05-06T00:00:00.000Z' },
    });
    const publisher = new DiscordOutreachPublisher(() => TOKEN, fetchFn);

    const result = await publisher.publishToDiscord(CHANNEL, 'hello world');

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = (fetchFn as Mock).mock.calls[0]!;
    expect(url).toBe(`https://discord.com/api/v10/channels/${CHANNEL}/messages`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bot ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'hello world' });
    expect(result.messageId).toBe('msg-1');
    expect(result.postedAt).toBe('2026-05-06T00:00:00.000Z');
  });

  it('NEVER writes the bot token to any console method', async () => {
    const fetchFn = makeFetch({
      ok: true,
      body: { id: 'm', timestamp: '2026-05-06T00:00:00.000Z' },
    });
    const publisher = new DiscordOutreachPublisher(() => TOKEN, fetchFn);

    await publisher.publishToDiscord(CHANNEL, 'hi');

    const allLogged = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');
    expect(allLogged).not.toContain(TOKEN);
  });

  it('throws OutreachPublisherError when the resolver returns no token', async () => {
    const publisher = new DiscordOutreachPublisher(() => undefined, makeFetch({ ok: true }));
    await expect(publisher.publishToDiscord(CHANNEL, 'hi')).rejects.toBeInstanceOf(
      OutreachPublisherError
    );
  });

  it('throws OutreachPublisherError on non-2xx without leaking the token in the message', async () => {
    const publisher = new DiscordOutreachPublisher(
      () => TOKEN,
      makeFetch({ ok: false, status: 401, body: { message: '401: Unauthorized' } })
    );

    let caught: unknown;
    try {
      await publisher.publishToDiscord(CHANNEL, 'hi');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OutreachPublisherError);
    expect(String((caught as Error).message)).not.toContain(TOKEN);
  });
});
