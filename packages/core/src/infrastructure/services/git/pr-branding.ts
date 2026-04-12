/**
 * PR & Commit Branding
 *
 * Centralizes the branding used in pull request bodies and commit
 * trailers created by Shep. Ensures consistent attribution across all
 * PR creation paths (agent-driven, fork-and-PR, etc.) and all commit
 * paths (agent commits, squash-merge commits, CI-fix commits).
 */

/** The branding line to append to PR bodies. */
export const PR_BRANDING =
  '[🐑](https://github.com/shep-ai/shep) Built with [Shep.bot](https://shep.bot)';

/** The co-author trailer to include in commit messages. */
export const COMMIT_CO_AUTHOR = 'Co-Authored-By: Shep Bot <shep-agent@users.noreply.github.com>';

/**
 * Pattern matching common AI-tool attribution footers that should be
 * replaced (e.g. "Generated with Claude Code", "Co-Authored-By: Claude").
 */
const UNWANTED_PR_BRANDING_PATTERN =
  /\n*(?:🤖\s*)?Generated with \[Claude Code\]\(https:\/\/claude\.com\/claude-code\)\s*/gi;

/**
 * Pattern matching unwanted Co-Authored-By trailers from AI tools.
 * Matches lines like:
 *   Co-Authored-By: Claude <noreply@anthropic.com>
 *   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
 *   Co-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>
 */
const UNWANTED_CO_AUTHOR_PATTERN = /\n*Co-Authored-By:\s*Claude[^\n]*<noreply@anthropic\.com>\s*/gi;

/**
 * Ensure a PR body carries the correct Shep branding.
 *
 * 1. Strips any unwanted AI-tool attribution footers
 * 2. Strips any unwanted Co-Authored-By trailers
 * 3. Appends the Shep branding line if not already present
 */
export function applyPrBranding(body: string): string {
  // Strip unwanted branding
  let cleaned = body.replace(UNWANTED_PR_BRANDING_PATTERN, '');

  // Strip unwanted co-author trailers
  cleaned = cleaned.replace(UNWANTED_CO_AUTHOR_PATTERN, '');

  // Trim trailing whitespace/newlines before appending branding
  cleaned = cleaned.trimEnd();

  // Only append if not already present
  if (!cleaned.includes(PR_BRANDING)) {
    cleaned = `${cleaned}\n\n${PR_BRANDING}`;
  }

  return cleaned;
}

/**
 * Ensure a commit message carries the correct Shep co-author trailer.
 *
 * 1. Strips any unwanted Co-Authored-By trailers (e.g. Claude)
 * 2. Appends the Shep Bot co-author trailer if not already present
 */
export function applyCommitBranding(message: string): string {
  // Strip unwanted co-author trailers
  let cleaned = message.replace(UNWANTED_CO_AUTHOR_PATTERN, '');

  // Trim trailing whitespace/newlines
  cleaned = cleaned.trimEnd();

  // Only append if not already present
  if (!cleaned.includes(COMMIT_CO_AUTHOR)) {
    cleaned = `${cleaned}\n\n${COMMIT_CO_AUTHOR}`;
  }

  return cleaned;
}
