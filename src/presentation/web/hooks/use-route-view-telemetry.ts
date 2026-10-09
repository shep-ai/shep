'use client';

import { useEffect, useRef } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { recordWebAreaView } from '@/app/actions/telemetry';
import { toRouteView } from '@/lib/telemetry-route';

/**
 * Records web.area.viewed (spec 133) once per route the user navigates to.
 * Sends the route template (`/feature/[featureId]`), never the concrete path.
 */
export function useRouteViewTelemetry(): void {
  const pathname = usePathname();
  const params = useParams();
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const view = toRouteView(pathname, params ?? {});
    if (view.route === lastRoute.current) return;
    lastRoute.current = view.route;
    recordWebAreaView(view.area, view.route).catch(() => undefined);
  }, [pathname, params]);
}
