/**
 * Shared config helper for contributor-onboarding server actions
 * (spec 097, task-47).
 *
 * Keeps the owner/repo defaults in one place so the leaderboard, curated
 * issues, and doctor surfaces all read from the same source. Defaults are
 * the upstream Shep repo; override via env when an adopting project runs
 * its own dashboard.
 */

const DEFAULT_OWNER = 'shep-ai';
const DEFAULT_REPO = 'shep';

export interface ContributorOnboardingConfig {
  owner: string;
  repo: string;
}

export function GetContributorOnboardingConfig(): ContributorOnboardingConfig {
  return {
    owner: process.env.SHEP_CONTRIBUTORS_OWNER ?? DEFAULT_OWNER,
    repo: process.env.SHEP_CONTRIBUTORS_REPO ?? DEFAULT_REPO,
  };
}
