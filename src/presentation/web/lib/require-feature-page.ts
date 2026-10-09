import { notFound } from 'next/navigation';
import { getFeatureFlags, type FeatureFlagsState } from '@/lib/feature-flags';

/**
 * 404s a page unless at least one of `flags` is on. Call it first thing in a
 * flag-gated page so a hidden area cannot be reached by its URL either.
 */
export function requireFeaturePage(...flags: (keyof FeatureFlagsState)[]): void {
  const current = getFeatureFlags();
  if (!flags.some((flag) => current[flag])) notFound();
}
