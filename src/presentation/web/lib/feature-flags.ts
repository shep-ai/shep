/**
 * Feature flags for the web UI.
 *
 * DB-primary resolution: reads from Settings.featureFlags when available,
 * falls back to NEXT_PUBLIC_ environment variables.
 * The debug flag is DB-only (no env var fallback).
 */

import { hasSettings, getSettings } from '@shepai/core/infrastructure/services/settings.service';

function isEnabled(envVar: string | undefined): boolean {
  return envVar === 'true' || envVar === '1';
}

export interface FeatureFlagsState {
  envDeploy: boolean;
  debug: boolean;
  reactFileManager: boolean;
  projects: boolean;
  codeReview: boolean;
}

export function getFeatureFlags(): FeatureFlagsState {
  try {
    if (hasSettings()) {
      const flags = getSettings().featureFlags;
      if (flags) {
        return {
          envDeploy: flags.envDeploy,
          debug: flags.debug,
          reactFileManager: flags.reactFileManager,
          projects: flags.projects,
          codeReview: flags.codeReview,
        };
      }
    }
  } catch {
    // Settings not initialized (e.g., during build/SSG or client-side hydration)
  }

  return {
    envDeploy:
      process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY !== undefined
        ? isEnabled(process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY)
        : true,
    debug: false,
    reactFileManager: isEnabled(process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER),
    projects: false,
    codeReview: false,
  };
}

/**
 * @deprecated Use getFeatureFlags() instead for DB-primary resolution.
 * Kept for backward compatibility during migration.
 */
export const featureFlags = {
  get envDeploy() {
    return getFeatureFlags().envDeploy;
  },
  get debug() {
    return getFeatureFlags().debug;
  },
  get reactFileManager() {
    return getFeatureFlags().reactFileManager;
  },
  get projects() {
    return getFeatureFlags().projects;
  },
  get codeReview() {
    return getFeatureFlags().codeReview;
  },
} as const;
