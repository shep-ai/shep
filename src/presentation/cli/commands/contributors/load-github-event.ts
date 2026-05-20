/**
 * GitHub Actions event-payload loader.
 *
 * Workflows triggered by `pull_request` / `issues` events drop a JSON file
 * with the full webhook payload at `$GITHUB_EVENT_PATH`. CLI subcommands
 * invoked from those workflows resolve the input by reading that file —
 * never by re-fetching from the API and never by relying on env-var
 * fragments alone.
 *
 * Returned value is `unknown` so callers do schema-narrowing at the
 * boundary they own (welcome-pr expects a `pull_request`, groom-issue
 * expects an `issue`).
 */

import { readFileSync } from 'node:fs';

const GITHUB_EVENT_PATH_ENV = 'GITHUB_EVENT_PATH';
const GITHUB_REPOSITORY_ENV = 'GITHUB_REPOSITORY';

export class MissingGitHubEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingGitHubEventError';
  }
}

/**
 * Read and parse `$GITHUB_EVENT_PATH` JSON. Throws a typed error rather
 * than returning `undefined` so callers can fail loudly when a workflow
 * is misconfigured.
 */
export function loadGitHubEvent(): unknown {
  const path = process.env[GITHUB_EVENT_PATH_ENV];
  if (!path) {
    throw new MissingGitHubEventError(
      `${GITHUB_EVENT_PATH_ENV} is not set; this command must run inside a GitHub Actions event-driven workflow.`
    );
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    const err = cause instanceof Error ? cause : new Error(String(cause));
    throw new MissingGitHubEventError(
      `Unable to read ${GITHUB_EVENT_PATH_ENV} (${path}): ${err.message}`
    );
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (cause) {
    const err = cause instanceof Error ? cause : new Error(String(cause));
    throw new MissingGitHubEventError(
      `Failed to parse ${GITHUB_EVENT_PATH_ENV} JSON: ${err.message}`
    );
  }
}

/**
 * Resolve `owner/repo` from `$GITHUB_REPOSITORY`. Returns `null` when the
 * env var is missing — callers can fall back to a payload field.
 */
export function readGitHubRepositoryEnv(): { owner: string; repo: string } | null {
  const slug = process.env[GITHUB_REPOSITORY_ENV];
  if (!slug) return null;
  const slashIndex = slug.indexOf('/');
  if (slashIndex <= 0 || slashIndex === slug.length - 1) return null;
  return {
    owner: slug.slice(0, slashIndex),
    repo: slug.slice(slashIndex + 1),
  };
}
