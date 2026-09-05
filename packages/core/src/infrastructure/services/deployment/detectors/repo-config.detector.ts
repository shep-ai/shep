/**
 * Repo-config detector — a committed `.shep/dev.json`.
 *
 * A thin projection of {@link readRepoDevConfig} into the detector contract,
 * so the file is consumable anywhere a detector is.
 *
 * NOTE: this detector is deliberately NOT part of `DETECTOR_REGISTRY`. The
 * file is the highest-precedence tier, which means it must be read BEFORE the
 * persisted run-plan cache — a registry entry runs after that cache and would
 * lose to a stale plan. The graph's analyze node consumes it directly at tier
 * zero; the registry starts at Node.
 */

import { createDeploymentLogger } from '../deployment-logger.js';
import { readRepoDevConfig, REPO_DEV_CONFIG_PATH } from '../repo-dev-config-reader.js';
import type { Detector, DetectorResult } from './types.js';

const log = createDeploymentLogger('[detectRepoConfig]');

/**
 * Detect a user-authored run plan committed to the repository.
 *
 * @param dirPath - Absolute path to the repository root.
 * @returns The declared command, or a fall-through error when the file is
 *          absent or invalid (the reader logs why).
 */
export const detectRepoConfig: Detector = (dirPath: string): DetectorResult => {
  const config = readRepoDevConfig(dirPath);
  if (config === null) {
    return { success: false, error: `No valid ${REPO_DEV_CONFIG_PATH} found in ${dirPath}` };
  }

  log.info(`detected — command="${config.command}", resolvedDir="${config.cwd}"`);

  return {
    success: true,
    command: config.command,
    // The user told us what to run; there is no manifest to infer install
    // state from, and their own setupCommands cover anything that is needed.
    needsInstall: false,
    resolvedDir: config.cwd,
    setupCommands: config.setupCommands,
    ...(config.expectedPort !== undefined ? { expectedPort: config.expectedPort } : {}),
    ...(config.language !== undefined ? { language: config.language } : {}),
    ...(config.framework !== undefined ? { framework: config.framework } : {}),
    ...(config.packageManager !== undefined ? { packageManager: config.packageManager } : {}),
  };
};
