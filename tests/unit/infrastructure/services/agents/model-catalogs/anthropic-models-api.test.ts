/**
 * Anthropic Models API client — unit tests.
 *
 * Every test injects `fetchFn` and `env`, so nothing reaches the network or
 * depends on credentials present on the machine running the suite.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ANTHROPIC_MODELS_API_MAX_PAGES,
  listAnthropicModels,
  resolveAnthropicModelsApiAuth,
} from '@/infrastructure/services/agents/common/model-catalogs/anthropic-models-api.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function page(ids: string[], hasMore = false) {
  return {
    data: ids.map((id) => ({ type: 'model', id, display_name: id, created_at: '2026-01-01' })),
    has_more: hasMore,
    first_id: ids[0] ?? null,
    last_id: ids[ids.length - 1] ?? null,
  };
}

function requestUrl(fetchFn: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchFn.mock.calls[call][0]));
}

function requestHeaders(fetchFn: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  return (fetchFn.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

describe('resolveAnthropicModelsApiAuth', () => {
  it('sends ANTHROPIC_API_KEY as x-api-key against the public endpoint', () => {
    const auth = resolveAnthropicModelsApiAuth({ ANTHROPIC_API_KEY: 'sk-ant-key' });

    expect(auth?.baseUrl).toBe('https://api.anthropic.com');
    expect(auth?.headers['x-api-key']).toBe('sk-ant-key');
    expect(auth?.headers.Authorization).toBeUndefined();
    expect(auth?.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('sends ANTHROPIC_AUTH_TOKEN as a bearer token', () => {
    const auth = resolveAnthropicModelsApiAuth({ ANTHROPIC_AUTH_TOKEN: 'gateway-token' });

    expect(auth?.headers.Authorization).toBe('Bearer gateway-token');
    expect(auth?.headers['x-api-key']).toBeUndefined();
  });

  it('prefers the API key when both credentials are set, like the claude CLI', () => {
    const auth = resolveAnthropicModelsApiAuth({
      ANTHROPIC_API_KEY: 'sk-ant-key',
      ANTHROPIC_AUTH_TOKEN: 'gateway-token',
    });

    expect(auth?.headers['x-api-key']).toBe('sk-ant-key');
    expect(auth?.headers.Authorization).toBeUndefined();
  });

  it('honours ANTHROPIC_BASE_URL and tolerates a trailing slash', () => {
    const auth = resolveAnthropicModelsApiAuth({
      ANTHROPIC_API_KEY: 'k',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/anthropic/',
    });

    expect(auth?.baseUrl).toBe('https://gateway.example.com/anthropic');
  });

  it('returns null without a credential', () => {
    expect(resolveAnthropicModelsApiAuth({})).toBeNull();
    expect(resolveAnthropicModelsApiAuth({ ANTHROPIC_API_KEY: '   ' })).toBeNull();
  });

  it('does not use the Claude subscription OAuth token', () => {
    expect(resolveAnthropicModelsApiAuth({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat' })).toBeNull();
  });

  it.each(['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'])(
    'returns null when %s routes Claude Code through a cloud provider',
    (flag) => {
      expect(resolveAnthropicModelsApiAuth({ ANTHROPIC_API_KEY: 'k', [flag]: '1' })).toBeNull();
    }
  );

  it('ignores a cloud-provider flag explicitly set to a falsy value', () => {
    expect(
      resolveAnthropicModelsApiAuth({ ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_USE_BEDROCK: '0' })
    ).not.toBeNull();
  });
});

describe('listAnthropicModels', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-key' };

  it('returns null and makes no request without credentials', async () => {
    const fetchFn = vi.fn();

    await expect(listAnthropicModels({ fetchFn, env: {} })).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requests /v1/models with auth headers and a timeout signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse(page(['claude-opus-5-5'])));

    await listAnthropicModels({ fetchFn, env });

    const url = requestUrl(fetchFn);
    expect(`${url.origin}${url.pathname}`).toBe('https://api.anthropic.com/v1/models');
    expect(requestHeaders(fetchFn)['x-api-key']).toBe('sk-ant-key');
    expect((fetchFn.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('maps display name, context window and vendor', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        data: [
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            created_at: '2026-09-01T00:00:00Z',
            max_input_tokens: 1_000_000,
            max_tokens: 128_000,
          },
        ],
        has_more: false,
        first_id: 'claude-opus-5-5',
        last_id: 'claude-opus-5-5',
      })
    );

    await expect(listAnthropicModels({ fetchFn, env })).resolves.toEqual([
      {
        id: 'claude-opus-5-5',
        displayName: 'Opus 5.5',
        contextLength: 1_000_000,
        vendor: 'anthropic',
      },
    ]);
  });

  it('follows has_more / last_id pagination', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(okResponse(page(['claude-opus-5-5', 'claude-sonnet-5'], true)))
      .mockResolvedValueOnce(okResponse(page(['claude-haiku-4-5'])));

    const listings = await listAnthropicModels({ fetchFn, env });

    expect(listings?.map((l) => l.id)).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
    ]);
    expect(requestUrl(fetchFn, 0).searchParams.get('after_id')).toBeNull();
    expect(requestUrl(fetchFn, 1).searchParams.get('after_id')).toBe('claude-sonnet-5');
  });

  it('stops after the page cap even if the server keeps reporting more', async () => {
    let n = 0;
    const fetchFn = vi.fn().mockImplementation(async () => okResponse(page([`m-${n++}`], true)));

    const listings = await listAnthropicModels({ fetchFn, env });

    expect(fetchFn).toHaveBeenCalledTimes(ANTHROPIC_MODELS_API_MAX_PAGES);
    expect(listings).toHaveLength(ANTHROPIC_MODELS_API_MAX_PAGES);
  });

  it('throws with the status, never the credential, on a non-OK response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('denied', { status: 401 }));

    const error = await listAnthropicModels({ fetchFn, env }).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('401');
    expect((error as Error).message).not.toContain('sk-ant-key');
  });

  it('skips entries without an id', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        okResponse({ data: [{ id: '' }, { id: 'claude-haiku-4-5' }], has_more: false })
      );

    const listings = await listAnthropicModels({ fetchFn, env });

    expect(listings?.map((l) => l.id)).toEqual(['claude-haiku-4-5']);
  });
});
