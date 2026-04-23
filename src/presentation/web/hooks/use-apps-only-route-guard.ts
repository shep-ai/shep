'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import type { ShellVariant } from '@/lib/shell-variant';

/**
 * Allowed URL prefixes in apps-only mode. Anything outside this list
 * is bounced to /applications on the next client-side navigation.
 * Exported for reuse (e.g., a sibling link-guard component).
 */
export const APPS_ONLY_ALLOWED_PATHS = ['/applications', '/application/'] as const;
export const APPS_ONLY_FALLBACK_PATH = '/applications';

function isAllowed(pathname: string): boolean {
  if (pathname === '/applications') return true;
  if (pathname.startsWith('/application/')) return true;
  return false;
}

/**
 * Client-side route guard for apps-only mode. No-op when variant='full'.
 * When variant='apps-only', redirects any path outside the allowed list
 * back to /applications via router.replace on pathname change.
 */
export function useAppsOnlyRouteGuard(variant: ShellVariant): void {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (variant !== 'apps-only') return;
    if (!pathname) return;
    if (isAllowed(pathname)) return;
    router.replace(APPS_ONLY_FALLBACK_PATH);
  }, [variant, pathname, router]);
}
