/**
 * FIRST EPSS feed loader (feature 098, phase 4, task-22).
 *
 * The EPSS daily download is a gzipped CSV at
 *   https://epss.cyentia.com/epss_scores-current.csv.gz
 * For MVP we accept either the plain CSV or a gzipped body — the injected
 * fetch is responsible for handling the transport and content-encoding
 * automatically (undici / Node fetch decompress when `accept-encoding`
 * is set). We do not depend on a decompression library; tests inject the
 * plain-CSV form.
 *
 * The CSV body starts with one comment line (`#model_version`) and a
 * header row `cve,epss,percentile`; subsequent rows are
 * `CVE-yyyy-N,score,percentile`. We index by uppercase CVE id and return
 * percentile in [0, 1].
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EPSS_FEED_URL = 'https://epss.cyentia.com/epss_scores-current.csv';
const EPSS_MIN_ROWS = 100;

export interface EpssLoaderDeps {
  fetch: typeof globalThis.fetch;
  now: () => Date;
  cachePath: string;
  feedUrl?: string;
  /** Cache TTL in milliseconds (default 24h). */
  ttlMs?: number;
}

function parseEpssCsv(body: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = body.split(/\r?\n/);
  let headerSeen = false;
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue;
    if (!headerSeen) {
      headerSeen = true; // skip the `cve,epss,percentile` header row.
      continue;
    }
    const cells = line.split(',');
    if (cells.length < 3) continue;
    const cveId = (cells[0] ?? '').trim().toUpperCase();
    const percentileStr = (cells[2] ?? '').trim();
    if (cveId.length === 0 || percentileStr.length === 0) continue;
    const percentile = Number(percentileStr);
    if (Number.isNaN(percentile)) continue;
    map.set(cveId, percentile);
  }
  return map;
}

function readCacheFile(path: string): Map<string, number> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf8');
    const map = parseEpssCsv(raw);
    return map.size === 0 ? undefined : map;
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
  deps: Required<Omit<EpssLoaderDeps, 'ttlMs'>> & { ttlMs: number }
): Promise<Map<string, number> | undefined> {
  try {
    const response = await deps.fetch(deps.feedUrl);
    if (!response.ok) return undefined;
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    // EPSS CSV may be served as text/csv, application/octet-stream (gzipped), or text/plain.
    if (
      !contentType.includes('csv') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('octet-stream')
    ) {
      return undefined;
    }
    const body = await response.text();
    const map = parseEpssCsv(body);
    if (map.size < EPSS_MIN_ROWS) return undefined;
    try {
      mkdirSync(dirname(deps.cachePath), { recursive: true });
      writeFileSync(deps.cachePath, body, 'utf8');
    } catch {
      // Non-fatal — keep the in-memory map even if disk cache fails.
    }
    return map;
  } catch {
    return undefined;
  }
}

export async function loadEpssMap(rawDeps: EpssLoaderDeps): Promise<Map<string, number>> {
  const deps = {
    fetch: rawDeps.fetch,
    now: rawDeps.now,
    cachePath: rawDeps.cachePath,
    feedUrl: rawDeps.feedUrl ?? EPSS_FEED_URL,
    ttlMs: rawDeps.ttlMs ?? 24 * 60 * 60 * 1000,
  };

  if (isCacheFresh(deps.cachePath, deps.ttlMs, deps.now())) {
    const cached = readCacheFile(deps.cachePath);
    if (cached !== undefined) return cached;
  }

  const fresh = await fetchAndCache(deps);
  if (fresh !== undefined) return fresh;

  const stale = readCacheFile(deps.cachePath);
  return stale ?? new Map<string, number>();
}
