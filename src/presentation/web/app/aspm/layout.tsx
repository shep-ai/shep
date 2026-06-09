/**
 * /aspm layout — feature-flag gate for the entire ASPM web surface.
 *
 * Spec 098 ships behind the `aspm` feature flag. When the flag is off
 * every page under /aspm responds with the standard Next.js not-found
 * page, matching the pattern used by /agents (collaboration flag) and
 * keeping the surface invisible to users who haven't opted in.
 */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/feature-flags';
import { AspmSubNav } from '@/components/features/aspm/aspm-sub-nav/aspm-sub-nav';

export default function AspmLayout({ children }: { children: ReactNode }) {
  const flags = getFeatureFlags();
  if (!flags.aspm) {
    notFound();
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <AspmSubNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
