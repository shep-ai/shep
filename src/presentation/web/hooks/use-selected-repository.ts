'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { URL_PARAMS } from '@/lib/url-params';

/**
 * Extracts the selected repository context from the current URL.
 * Returns `{ id, path }` — either or both may be set depending on the route.
 *
 * Matches:
 * - `/repository/<id>` → id is set
 * - `/create?repo=<path>` → path is set
 */
export function useSelectedRepository(): { id: string | null; path: string | null } {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const repoIdMatch = pathname.match(/^\/repository\/([^/]+)/);
  const id = repoIdMatch?.[1] ?? null;

  const isCreate = pathname.startsWith('/create');
  const path = isCreate ? searchParams.get(URL_PARAMS.repo) : null;

  return { id, path };
}
