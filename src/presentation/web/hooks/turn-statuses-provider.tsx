'use client';

import { type ReactNode } from 'react';
import { useTurnStatusSync } from './use-turn-statuses';
// We re-export useTurnStatus from the provider file to not break existing imports
export { useTurnStatus } from './use-turn-statuses';

/**
 * Initializes the global turn-statuses stream.
 * Components use `useTurnStatus(scopeId)` to read individual statuses.
 */
export function TurnStatusesProvider({ children }: { children: ReactNode }) {
  // Sets up the SSE listener and updates the Zustand store.
  useTurnStatusSync();

  return children;
}
