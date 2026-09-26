/**
 * Anthropic Models API client.
 *
 * Lists the Claude models the configured Anthropic account can call, via
 * `GET /v1/models`, so new releases reach the model picker without a code
 * change. Used by {@link ClaudeCodeModelCatalogService} as its first source.
 *
 * Credentials are resolved exactly as the `claude` CLI resolves them, because
 * the list must describe the endpoint the Claude Code executor will actually
 * call:
 * - `ANTHROPIC_API_KEY` → `x-api-key` (wins when both are set)
 * - `ANTHROPIC_AUTH_TOKEN` → `Authorization: Bearer` (LLM gateways)
 * - `ANTHROPIC_BASE_URL` → request host (defaults to the public API)
 *
 * The Claude subscription OAuth token is deliberately NOT used: it is issued
 * to the Claude Code client. Subscription-only users fall through to the CLI
 * alias probe. Bedrock / Vertex / Foundry modes use different model ids, so
 * the first-party list would be wrong there and is skipped.
 *
 * API docs: https://docs.anthropic.com/en/api/models-list
 */

import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MODEL_CATALOG_FETCH_TIMEOUT_MS } from './catalog-fetch.js';

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_API_VERSION = '2023-06-01';
const MODELS_PATH = '/v1/models';
const ANTHROPIC_VENDOR = 'anthropic';

/** Largest page the Models API accepts. */
const PAGE_SIZE = 1000;
/** Upper bound on pages followed, so a misbehaving gateway cannot loop forever. */
export const ANTHROPIC_MODELS_API_MAX_PAGES = 10;

/**
 * Claude Code switches to a cloud provider when any of these is truthy.
 * Source: Claude Code third-party integration docs.
 */
const CLOUD_PROVIDER_FLAGS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
] as const;
const FALSY_FLAG_VALUES = new Set(['', '0', 'false', 'no', 'off']);

/**
 * The Models API returns names like "Claude Opus 5.5". Every Claude Code
 * listing is already grouped under the Claude Code agent, and the curated
 * names in the web metadata omit the vendor, so the prefix is dropped.
 */
const DISPLAY_NAME_VENDOR_PREFIX = /^Claude\s+/i;

export type EnvLike = Readonly<Record<string, string | undefined>>;
type FetchFn = typeof fetch;

export interface AnthropicModelsApiAuth {
  /** Base URL without a trailing slash. */
  baseUrl: string;
  headers: Record<string, string>;
}

interface AnthropicModelEntry {
  id?: string;
  display_name?: string;
  max_input_tokens?: number;
}

interface AnthropicModelsPage {
  data?: AnthropicModelEntry[];
  has_more?: boolean;
  last_id?: string | null;
}

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function isFlagEnabled(value: string | undefined): boolean {
  return value !== undefined && !FALSY_FLAG_VALUES.has(value.trim().toLowerCase());
}

/**
 * Resolve the base URL and headers for a Models API request.
 *
 * @returns `null` when there is no usable first-party credential — the caller
 *   must fall back to another discovery source, not treat it as an error.
 */
export function resolveAnthropicModelsApiAuth(
  env: EnvLike = process.env
): AnthropicModelsApiAuth | null {
  if (CLOUD_PROVIDER_FLAGS.some((flag) => isFlagEnabled(env[flag]))) return null;

  const apiKey = nonBlank(env.ANTHROPIC_API_KEY);
  const authToken = nonBlank(env.ANTHROPIC_AUTH_TOKEN);
  if (!apiKey && !authToken) return null;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  else headers.Authorization = `Bearer ${authToken}`;

  const baseUrl = (nonBlank(env.ANTHROPIC_BASE_URL) ?? ANTHROPIC_DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  );
  return { baseUrl, headers };
}

function toListing(entry: AnthropicModelEntry & { id: string }): AgentModelListing {
  const displayName = nonBlank(entry.display_name?.replace(DISPLAY_NAME_VENDOR_PREFIX, ''));
  return {
    id: entry.id,
    ...(displayName ? { displayName } : {}),
    ...(entry.max_input_tokens ? { contextLength: entry.max_input_tokens } : {}),
    vendor: ANTHROPIC_VENDOR,
  };
}

export interface ListAnthropicModelsOptions {
  fetchFn?: FetchFn;
  env?: EnvLike;
}

/**
 * List every model the account can use, newest first (the API's order).
 *
 * @returns `null` when no credential is configured (no request is made).
 * @throws when the API answers with a non-OK status or the request fails —
 *   the message carries the status only, never the credential.
 */
export async function listAnthropicModels(
  options: ListAnthropicModelsOptions = {}
): Promise<AgentModelListing[] | null> {
  const { fetchFn = fetch, env = process.env } = options;
  const auth = resolveAnthropicModelsApiAuth(env);
  if (!auth) return null;

  const listings: AgentModelListing[] = [];
  let afterId: string | undefined;

  for (let pageIndex = 0; pageIndex < ANTHROPIC_MODELS_API_MAX_PAGES; pageIndex++) {
    const url = new URL(`${auth.baseUrl}${MODELS_PATH}`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (afterId) url.searchParams.set('after_id', afterId);

    const response = await fetchFn(url, {
      headers: auth.headers,
      signal: AbortSignal.timeout(MODEL_CATALOG_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Anthropic Models API responded ${response.status}`);
    }

    const body = (await response.json()) as AnthropicModelsPage;
    for (const entry of body.data ?? []) {
      if (entry.id) listings.push(toListing({ ...entry, id: entry.id }));
    }

    afterId = body.last_id ?? undefined;
    if (!body.has_more || !afterId) break;
  }

  return listings;
}
