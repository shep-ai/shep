/**
 * HTTP plumbing shared by the connection clients (spec 122, generalised in spec 125): a timed JSON
 * request, the wait a rate-limited response asks for, and HTTP failures as the
 * port's typed errors.
 */

import {
  ConnectionAuthError,
  ConnectionRateLimitError,
  ConnectionRequestError,
} from '../../../application/ports/output/services/connection-errors.js';

export type FetchFunction = typeof fetch;

/** No connection call may hang a sync run. */
export const CONNECTION_REQUEST_TIMEOUT_MS = 30_000;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

export interface JsonResponse {
  response: Response;
  /** Parsed JSON, the raw text when it is not JSON, or undefined when empty. */
  body: unknown;
}

export async function sendJson(
  fetchFn: FetchFunction,
  url: string,
  init: RequestInit
): Promise<JsonResponse> {
  const response = await fetchFn(url, {
    ...init,
    signal: AbortSignal.timeout(CONNECTION_REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!text) return { response, body: undefined };
  try {
    return { response, body: JSON.parse(text) as unknown };
  } catch {
    return { response, body: text };
  }
}

/** The wait a response asks for: Retry-After seconds, or Linear's reset time. */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const retryAfter = Number(headers.get('retry-after') ?? Number.NaN);
  if (Number.isFinite(retryAfter)) return retryAfter * MS_PER_SECOND;
  const resetAt = Number(headers.get('x-ratelimit-requests-reset') ?? Number.NaN);
  if (Number.isFinite(resetAt)) return Math.max(resetAt - now, 0);
  return undefined;
}

/** The typed error for a failed response. */
export function httpFailure(label: string, response: Response, detail: string): Error {
  const message = `${label}: ${detail || `HTTP ${response.status}`}`;
  if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
    return new ConnectionAuthError(message);
  }
  if (response.status === HTTP_TOO_MANY_REQUESTS) {
    return new ConnectionRateLimitError(message, retryAfterMs(response.headers));
  }
  return new ConnectionRequestError(message, response.status);
}
