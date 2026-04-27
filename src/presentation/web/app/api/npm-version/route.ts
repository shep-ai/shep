import { NextResponse } from 'next/server';

// Force dynamic so Next.js doesn't statically optimize the route — we want
// the in-process cache below to be the single source of dedup, not Next's
// per-build-id render cache.
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const PACKAGE_NAME = '@shepai/cli';

let cachedVersion: { latest: string | null; fetchedAt: number } | null = null;
// Coalesce concurrent calls so when 10 tabs hit the route in the same
// millisecond, only one upstream request is made and they all see the
// same response.
let inflight: Promise<string | null> | null = null;

function withCacheHeaders(body: unknown, init?: ResponseInit): NextResponse {
  const res = NextResponse.json(body, init);
  // Allow the browser (and any intermediate proxy in the dev/electron
  // shell) to reuse this response across tabs/refreshes for the TTL.
  res.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  return res;
}

async function fetchLatestFromNpm(): Promise<string | null> {
  const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status}`);
  }
  const data = (await res.json()) as { version?: string };
  return data.version ?? null;
}

export async function GET(): Promise<NextResponse> {
  // Fast path: cache hit.
  if (cachedVersion && Date.now() - cachedVersion.fetchedAt < CACHE_TTL_MS) {
    return withCacheHeaders({ latest: cachedVersion.latest });
  }

  // Already fetching from another request? Await the same promise.
  if (inflight) {
    try {
      const latest = await inflight;
      return withCacheHeaders({ latest });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check npm version';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  inflight = fetchLatestFromNpm();
  try {
    const latest = await inflight;
    cachedVersion = { latest, fetchedAt: Date.now() };
    return withCacheHeaders({ latest });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check npm version';
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    inflight = null;
  }
}
