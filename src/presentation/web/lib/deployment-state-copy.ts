/**
 * Shared presenter helper — maps a "starting" DeploymentState (Analyzing /
 * Installing / Booting) to the copy shown in the UI. The agentic
 * dev-server graph runs these three stages before reaching Ready:
 *
 *   Analyzing   → inspecting the repo to figure out how to run it
 *   Installing  → installing missing dependencies
 *   Booting     → spawning the dev server process itself
 *
 * Before this existed, every "Starting…" state was faked as a single
 * "Installing dependencies and booting…" message regardless of which
 * stage the graph was actually in. Centralising the copy here means the
 * badge, the Web preview tab, and any future surface all describe the
 * same stage the same (truthful) way.
 */

import { DeploymentState } from '@shepai/core/domain/generated/output';

/** Short label used by compact UI (badges, node rows). */
export const DEPLOYMENT_STARTING_LABELS: Partial<Record<DeploymentState, string>> = {
  [DeploymentState.Analyzing]: 'Analyzing...',
  [DeploymentState.Installing]: 'Installing...',
  [DeploymentState.Booting]: 'Starting...',
};

export interface DeploymentStartingCopy {
  title: string;
  description: string;
}

/** Longer title + description used by the Web preview tab's empty state. */
export const DEPLOYMENT_STARTING_COPY: Partial<Record<DeploymentState, DeploymentStartingCopy>> = {
  [DeploymentState.Analyzing]: {
    title: 'Analyzing project…',
    description: 'Inspecting the project to figure out how to run it. This only takes a moment.',
  },
  [DeploymentState.Installing]: {
    title: 'Installing dependencies…',
    description: 'Installing dependencies for the first run. This can take a minute.',
  },
  [DeploymentState.Booting]: {
    title: 'Starting dev server…',
    description: 'Booting the app. This can take a minute on the first run.',
  },
};

const DEFAULT_STARTING_LABEL = 'Starting...';
const DEFAULT_STARTING_COPY: DeploymentStartingCopy = DEPLOYMENT_STARTING_COPY[
  DeploymentState.Booting
] as DeploymentStartingCopy;

/** Short label for a starting state, falling back to the Booting copy when
 *  the status is null/loading-without-a-status-yet. */
export function getDeploymentStartingLabel(state: DeploymentState | null | undefined): string {
  if (state && DEPLOYMENT_STARTING_LABELS[state]) return DEPLOYMENT_STARTING_LABELS[state]!;
  return DEFAULT_STARTING_LABEL;
}

/** Title + description for a starting state, same fallback rule as above. */
export function getDeploymentStartingCopy(
  state: DeploymentState | null | undefined
): DeploymentStartingCopy {
  if (state && DEPLOYMENT_STARTING_COPY[state]) return DEPLOYMENT_STARTING_COPY[state]!;
  return DEFAULT_STARTING_COPY;
}
