'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { FeatureFlagsState } from '@/lib/feature-flags';

const defaultFlags: FeatureFlagsState = {
  skills: false,
  envDeploy: true,
  debug: false,
  githubImport: false,
  adoptBranch: false,
  gitRebaseSync: false,
  reactFileManager: false,
  coastsDevServer: false,
};

const FeatureFlagsContext = createContext<FeatureFlagsState>(defaultFlags);

interface FeatureFlagsProviderProps {
  children: ReactNode;
  flags: FeatureFlagsState;
}

/**
 * Provides server-resolved feature flags to all client components.
 * Initialized in the root layout with values from the DB singleton,
 * avoiding client-side fallback to environment variables.
 */
export function FeatureFlagsProvider({ children, flags }: FeatureFlagsProviderProps) {
  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

/**
 * Read feature flags from context. Returns all-flags-off defaults
 * when used outside a FeatureFlagsProvider (e.g., Storybook, tests).
 */
export function useFeatureFlags(): FeatureFlagsState {
  return useContext(FeatureFlagsContext);
}
