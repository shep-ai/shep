/**
 * GitHub remote URL helpers.
 *
 * Pure parsing of git remote URLs. Shared by the PR prompt builders (raw
 * evidence URLs) and telemetry (the GitHub owners of the repos Shep runs in).
 */

/**
 * Parse a GitHub remote URL (HTTPS or SSH) into owner/repo.
 * Returns null if the URL does not match a known GitHub format.
 */
export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  // SSH: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

/**
 * The distinct GitHub owners (users or organisations) behind a set of remote
 * URLs, lower-cased and sorted. Repository names are deliberately dropped.
 */
export function listGitHubOwners(remoteUrls: readonly (string | null | undefined)[]): string[] {
  const owners = new Set<string>();
  for (const url of remoteUrls) {
    if (!url) continue;
    const parsed = parseGitHubOwnerRepo(url);
    if (parsed) owners.add(parsed.owner.toLowerCase());
  }
  return [...owners].sort();
}
