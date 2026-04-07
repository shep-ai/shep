/**
 * GitHub Releases Update Checker
 *
 * Checks the GitHub Releases API for newer versions on app startup.
 * If a newer version is found, sends an IPC message to the renderer
 * which displays an in-app notification banner with a download link.
 *
 * Runs with a 10-second delay after app start to not block the UI.
 * Degrades gracefully when offline (catches network errors silently).
 */

import type { UpdateInfo } from './preload.js';

const UPDATE_CHECK_DELAY_MS = 10_000;

/** Injectable dependencies for the update checker. */
export interface UpdateCheckerDeps {
  currentVersion: string;
  repoOwner: string;
  repoName: string;
  fetch: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;
  sendToRenderer: (info: UpdateInfo) => void;
  warn: (msg: string, error?: unknown) => void;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
}

/**
 * Parse a version string like "v1.2.3" or "1.2.3" into [major, minor, patch].
 * Returns null for invalid version strings.
 */
function parseVersion(raw: string): [number, number, number] | null {
  const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;
  const parts = cleaned.split('.');
  if (parts.length !== 3) return null;

  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0)) return null;

  return nums as [number, number, number];
}

/**
 * Returns true if `remote` is newer than `local`.
 */
function isNewer(local: string, remote: string): boolean {
  const localParts = parseVersion(local);
  const remoteParts = parseVersion(remote);

  if (!localParts || !remoteParts) return false;

  for (let i = 0; i < 3; i++) {
    if (remoteParts[i]! > localParts[i]!) return true;
    if (remoteParts[i]! < localParts[i]!) return false;
  }
  return false;
}

/**
 * Check GitHub Releases for a newer version.
 * Runs after a 10-second delay to not block the UI.
 */
export function checkForUpdates(deps: UpdateCheckerDeps): void {
  setTimeout(async () => {
    try {
      const url = `https://api.github.com/repos/${deps.repoOwner}/${deps.repoName}/releases/latest`;
      const response = await deps.fetch(url);

      if (!response.ok) return;

      const release = (await response.json()) as GitHubRelease;
      const remoteVersion = release.tag_name.startsWith('v')
        ? release.tag_name.slice(1)
        : release.tag_name;

      if (isNewer(deps.currentVersion, remoteVersion)) {
        deps.sendToRenderer({
          version: remoteVersion,
          downloadUrl: release.html_url,
        });
      }
    } catch (error) {
      deps.warn('Update check failed:', error);
    }
  }, UPDATE_CHECK_DELAY_MS);
}
