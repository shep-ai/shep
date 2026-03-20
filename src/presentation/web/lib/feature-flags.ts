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
  skills: boolean;
  envDeploy: boolean;
  debug: boolean;
  githubImport: boolean;
  adoptBranch: boolean;
  gitRebaseSync: boolean;
  reactFileManager: boolean;
  coastsDevServer: boolean;
}

export function getFeatureFlags(): FeatureFlagsState {
  try {
    if (hasSettings()) {
      const flags = getSettings().featureFlags;
      if (flags) {
        return {
          skills: flags.skills,
          envDeploy: flags.envDeploy,
          debug: flags.debug,
          githubImport: flags.githubImport,
          adoptBranch: flags.adoptBranch,
          gitRebaseSync: flags.gitRebaseSync,
          reactFileManager: flags.reactFileManager,
          coastsDevServer: flags.coastsDevServer,
        };
      }
    }
  } catch {
    // Settings not initialized (e.g., during build/SSG or client-side hydration)
  }

  return {
    skills: isEnabled(process.env.NEXT_PUBLIC_FLAG_SKILLS),
    envDeploy:
      process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY !== undefined
        ? isEnabled(process.env.NEXT_PUBLIC_FLAG_ENV_DEPLOY)
        : true,
    debug: false,
    githubImport: false,
    adoptBranch: false,
    gitRebaseSync: false,
    reactFileManager: isEnabled(process.env.NEXT_PUBLIC_FLAG_REACT_FILE_MANAGER),
    coastsDevServer: isEnabled(process.env.NEXT_PUBLIC_FLAG_COASTS_DEV_SERVER),
  };
}

/**
 * @deprecated Use getFeatureFlags() instead for DB-primary resolution.
 * Kept for backward compatibility during migration.
 */
export const featureFlags = {
  get skills() {
    return getFeatureFlags().skills;
  },
  get envDeploy() {
    return getFeatureFlags().envDeploy;
  },
  get debug() {
    return getFeatureFlags().debug;
  },
  get githubImport() {
    return getFeatureFlags().githubImport;
  },
  get adoptBranch() {
    return getFeatureFlags().adoptBranch;
  },
  get gitRebaseSync() {
    return getFeatureFlags().gitRebaseSync;
  },
  get reactFileManager() {
    return getFeatureFlags().reactFileManager;
  },
  get coastsDevServer() {
    return getFeatureFlags().coastsDevServer;
  },
} as const;
