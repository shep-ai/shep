/**
 * Version Information Value Object
 *
 * Represents package version metadata shared across presentation layers.
 * Used by both CLI and Web UI to display consistent version information.
 */

export interface VersionInfo {
  /** Package version (e.g., "1.6.1") */
  version: string;
  /** Package name (e.g., "@shepai/cli") */
  name: string;
  /** Package description */
  description: string;
}

/** Default version info when package.json cannot be read */
export const DEFAULT_VERSION_INFO: VersionInfo = {
  version: 'unknown',
  name: '@shepai/cli',
  description:
    'Autonomous AI-native SDLC platform — run parallel AI agents in isolated worktrees to automate the development cycle from idea to deploy.',
};
