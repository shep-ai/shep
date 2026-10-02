/**
 * Minimal JSON-over-HTTP helper for decision providers (spec 119).
 * Uses the global fetch — no provider SDK — with a hard timeout. Every
 * failure becomes a DecisionProviderError so the router can fall back.
 */
import { DecisionProviderError } from '../../../../application/ports/output/harness/index.js';

export const DEFAULT_DECISION_TIMEOUT_MS = 10_000;

export async function postJson<T>(
  providerId: string,
  url: string,
  body: unknown,
  options: { timeoutMs?: number; apiKey?: string } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DECISION_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey && { authorization: `Bearer ${options.apiKey}` }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    const why =
      name === 'TimeoutError' || name === 'AbortError'
        ? `timed out after ${timeoutMs}ms`
        : (error as Error).message;
    throw new DecisionProviderError(providerId, `request to ${url} failed: ${why}`);
  }
  if (!response.ok) {
    throw new DecisionProviderError(providerId, `${url} returned HTTP ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new DecisionProviderError(providerId, `${url} returned invalid JSON`);
  }
}

/** Read an API key from the environment variable a config names (never the key itself). */
export function apiKeyFromEnv(envName: string | undefined): string | undefined {
  if (!envName) return undefined;
  const value = process.env[envName]?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function clampScore(n: unknown): number | undefined {
  if (typeof n !== 'number' || Number.isNaN(n)) return undefined;
  // Raw logits from a reranker: squash to (0, 1).
  if (n < 0 || n > 1) return 1 / (1 + Math.exp(-n));
  return n;
}
