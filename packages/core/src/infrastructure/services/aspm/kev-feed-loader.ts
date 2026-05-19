/**
 * CISA KEV feed loader (feature 098, phase 4, task-22).
 *
 * Reads + writes a local cache of the CISA Known Exploited Vulnerabilities
 * (KEV) catalog. Refreshes via the injected fetch when the cache file is
 * older than the configured TTL. On any fetch failure (network down,
 * non-200 response, missing content-type, too-small row count) the loader
 * falls back to the last good cache; if there is no cache it returns an
 * empty set so callers degrade gracefully.
 *
 * The set returned by {@link loadKevSet} contains uppercase CVE ids so
 * comparisons are case-insensitive.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const KEV_FEED_URL =
  'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const KEV_MIN_ROWS = 100;

export interface KevLoaderDeps {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  cachePath: string;
  feedUrl?: string;
  /** Cache TTL in milliseconds (default 24h). */
  ttlMs?: number;
}

interface KevDoc {
  vulnerabilities?: { cveID?: unknown }[];
}

function extractCveSet(doc: KevDoc): Set<string> {
  const set = new Set<string>();
  if (!Array.isArray(doc.vulnerabilities)) return set;
  for (const entry of doc.vulnerabilities) {
    const id = typeof entry?.cveID === 'string' ? entry.cveID : undefined;
    if (id !== undefined && id.length > 0) set.add(id.toUpperCase());
  }
  return set;
}

function readCacheFile(path: string): Set<string> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as KevDoc;
    const set = extractCveSet(parsed);
    return set.size === 0 ? undefined : set;
  } catch {
    return undefined;
  }
}

function isCacheFresh(path: string, ttlMs: number, now: Date): boolean {
  if (!existsSync(path)) return false;
  try {
    const stats = statSync(path);
    return now.getTime() - stats.mtimeMs < ttlMs;
  } catch {
    return false;
  }
}

async function fetchAndCache(
  deps: Required<Omit<KevLoaderDeps, 'ttlMs'>> & { ttlMs: number }
): Promise<Set<string> | undefined> {
  try {
    const response = await deps.fetch(deps.feedUrl);
    if (!response.ok) return undefined;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) return undefined;
    const body = await response.text();
    const parsed = JSON.parse(body) as KevDoc;
    const set = extractCveSet(parsed);
    if (set.size < KEV_MIN_ROWS) return undefined;
    try {
      mkdirSync(dirname(deps.cachePath), { recursive: true });
      writeFileSync(deps.cachePath, body, 'utf8');
    } catch {
      // Cache write failures are non-fatal — we still have the in-memory set.
    }
    return set;
  } catch {
    return undefined;
  }
}

export async function loadKevSet(rawDeps: KevLoaderDeps): Promise<Set<string>> {
  const deps = {
    fetch: rawDeps.fetch,
    now: rawDeps.now,
    cachePath: rawDeps.cachePath,
    feedUrl: rawDeps.feedUrl ?? KEV_FEED_URL,
    ttlMs: rawDeps.ttlMs ?? 24 * 60 * 60 * 1000,
  };

  if (isCacheFresh(deps.cachePath, deps.ttlMs, deps.now())) {
    const cached = readCacheFile(deps.cachePath);
    if (cached !== undefined) return cached;
  }

  const fresh = await fetchAndCache(deps);
  if (fresh !== undefined) return fresh;

  // Fetch failed — fall back to the last good cache if it exists.
  const stale = readCacheFile(deps.cachePath);
  return stale ?? new Set<string>();
}
