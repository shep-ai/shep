/**
 * Discord Outreach Publisher
 *
 * Publishes outreach messages drafted by the contributor pipeline to Discord
 * via the Discord REST API directly (no SDK — one POST endpoint per message).
 * The bot token is sourced from the existing config loader — typically
 * `process.env.DISCORD_BOT_TOKEN` — and is NEVER logged at any level.
 *
 * Posting itself is gated upstream through `ISupervisorAgent.evaluate(...)`.
 */

import { injectable } from 'tsyringe';

import {
  OutreachPublisherError,
  type IOutreachPublisher,
  type OutreachResult,
} from '../../../application/ports/output/services/outreach-publisher.interface.js';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * Resolves the Discord bot token. May return `undefined` when the token is
 * not configured — the publisher will surface a clean error in that case.
 */
export type DiscordTokenResolver = () => string | undefined;

/**
 * Subset of the global `fetch` shape this adapter touches. Defining our own
 * type so tests can stub without pulling Node's full lib.
 */
export type DiscordHttpFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

const defaultTokenResolver: DiscordTokenResolver = () =>
  process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN;

const defaultFetch: DiscordHttpFetch = (url, init) =>
  fetch(url, init) as unknown as ReturnType<DiscordHttpFetch>;

interface DiscordMessageResponse {
  id: string;
  timestamp: string;
}

@injectable()
export class DiscordOutreachPublisher implements IOutreachPublisher {
  constructor(
    private readonly tokenResolver: DiscordTokenResolver = defaultTokenResolver,
    private readonly httpFetch: DiscordHttpFetch = defaultFetch
  ) {}

  async publishToDiscord(channelId: string, body: string): Promise<OutreachResult> {
    const token = this.tokenResolver();
    if (!token || token.trim().length === 0) {
      throw new OutreachPublisherError(
        'Discord bot token is not configured. Set DISCORD_BOT_TOKEN in the environment.'
      );
    }

    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;
    let response: Awaited<ReturnType<DiscordHttpFetch>>;
    try {
      response = await this.httpFetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: body }),
      });
    } catch (err) {
      throw new OutreachPublisherError(
        `Discord transport failed for channel ${channelId}`,
        err instanceof Error ? err : new Error(String(err))
      );
    }

    if (!response.ok) {
      const text = await safeText(response);
      throw new OutreachPublisherError(
        `Discord rejected message to ${channelId} (HTTP ${response.status}): ${redact(text, token)}`
      );
    }

    const json = (await response.json()) as DiscordMessageResponse;
    return {
      messageId: json.id,
      postedAt: json.timestamp,
    };
  }
}

async function safeText(response: Awaited<ReturnType<DiscordHttpFetch>>): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function redact(text: string, token: string): string {
  if (!text) return '';
  return text.split(token).join('[REDACTED]');
}
