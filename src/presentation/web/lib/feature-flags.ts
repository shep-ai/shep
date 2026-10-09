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
  collaboration: boolean;
  aspm: boolean;
  bedrockIntegration: boolean;
  whatsappDispatch: boolean;
  clusters: boolean;
  scheduledWorkflows: boolean;
  githubImport: boolean;
  queryAwareHarness: boolean;
  spaces: boolean;
  trackers: boolean;
  knowledge: boolean;
  signals: boolean;
  opportunities: boolean;
  feedback: boolean;
  discovery: boolean;
  incidents: boolean;
  outcomes: boolean;
  docsFirst: boolean;
  autopilot: boolean;
  factory: boolean;
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
          collaboration: flags.collaboration,
          aspm: flags.aspm,
          bedrockIntegration: flags.bedrockIntegration,
          whatsappDispatch: flags.whatsappDispatch,
          clusters: flags.clusters,
          scheduledWorkflows: flags.scheduledWorkflows,
          githubImport: flags.githubImport ?? true,
          queryAwareHarness: flags.queryAwareHarness ?? false,
          spaces: flags.spaces ?? true,
          trackers: flags.trackers ?? true,
          knowledge: flags.knowledge ?? true,
          signals: flags.signals ?? true,
          opportunities: flags.opportunities ?? true,
          feedback: flags.feedback ?? true,
          discovery: flags.discovery ?? true,
          incidents: flags.incidents ?? true,
          outcomes: flags.outcomes ?? true,
          docsFirst: flags.docsFirst ?? true,
          autopilot: flags.autopilot ?? true,
          factory: flags.factory ?? true,
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
    projects:
      process.env.NEXT_PUBLIC_FLAG_PROJECTS !== undefined
        ? isEnabled(process.env.NEXT_PUBLIC_FLAG_PROJECTS)
        : true,
    codeReview:
      process.env.NEXT_PUBLIC_FLAG_CODE_REVIEW !== undefined
        ? isEnabled(process.env.NEXT_PUBLIC_FLAG_CODE_REVIEW)
        : true,
    collaboration:
      process.env.NEXT_PUBLIC_FLAG_COLLABORATION !== undefined
        ? isEnabled(process.env.NEXT_PUBLIC_FLAG_COLLABORATION)
        : true,
    aspm: isEnabled(process.env.NEXT_PUBLIC_FLAG_ASPM),
    bedrockIntegration: isEnabled(process.env.NEXT_PUBLIC_FLAG_BEDROCK_INTEGRATION),
    whatsappDispatch: isEnabled(process.env.NEXT_PUBLIC_FLAG_WHATSAPP_DISPATCH),
    clusters: false,
    scheduledWorkflows: false,
    githubImport: true,
    queryAwareHarness: isEnabled(process.env.NEXT_PUBLIC_FLAG_QUERY_AWARE_HARNESS),
    // Software-factory areas (spec 133) default on, like the settings defaults.
    spaces: true,
    trackers: true,
    knowledge: true,
    signals: true,
    opportunities: true,
    feedback: true,
    discovery: true,
    incidents: true,
    outcomes: true,
    docsFirst: true,
    autopilot: true,
    factory: true,
  };
}

/**
 * Error thrown by {@link requireFeatureFlag} when a flag is disabled.
 * Server actions catch this and translate it into `{ ok: false, error }`
 * so callers see a clear "feature off" message instead of a 500.
 */
export class FeatureFlagDisabledError extends Error {
  constructor(public readonly flag: keyof FeatureFlagsState) {
    super(`Feature flag "${flag}" is disabled`);
    this.name = 'FeatureFlagDisabledError';
  }
}

/**
 * Throws {@link FeatureFlagDisabledError} when the named flag is off.
 * Use at the top of every server action / API route handler that should
 * be reachable only when its feature is enabled — even hidden surfaces
 * still expose POST endpoints anyone with the URL can hit.
 */
export function requireFeatureFlag(flag: keyof FeatureFlagsState): void {
  if (!getFeatureFlags()[flag]) {
    throw new FeatureFlagDisabledError(flag);
  }
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
  get collaboration() {
    return getFeatureFlags().collaboration;
  },
  get aspm() {
    return getFeatureFlags().aspm;
  },
  get bedrockIntegration() {
    return getFeatureFlags().bedrockIntegration;
  },
  get whatsappDispatch() {
    return getFeatureFlags().whatsappDispatch;
  },
  get clusters() {
    return getFeatureFlags().clusters;
  },
  get scheduledWorkflows() {
    return getFeatureFlags().scheduledWorkflows;
  },
} as const;
