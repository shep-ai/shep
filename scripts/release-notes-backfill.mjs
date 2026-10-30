/* global process, console, fetch */

/**
 * Backfill GitHub release taglines from CHANGELOG.md.
 *
 * When Claude cannot run during a release (lost access, expired token), the
 * tagline step used to publish the CLI's error text — "Your organization does
 * not have access to Claude…" — as the release tagline (v1.219.0–v1.252.2).
 * CHANGELOG.md is the source of truth: correct the taglines there, then run
 * this to copy them into every GitHub release whose tagline is such an error.
 * Releases with any other tagline are never touched.
 *
 *   node scripts/release-notes-backfill.mjs [--apply] [--repo owner/name] [--changelog path]
 *
 * Without --apply it only reports what it would change. Needs GITHUB_TOKEN
 * (or GH_TOKEN) with `contents: write`. Also runs from the "Backfill release
 * taglines" workflow (.github/workflows/backfill-release-taglines.yml).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isServiceError } from './release-notes-claude.mjs';

const GITHUB_API = 'https://api.github.com';
const PER_PAGE = 100;
const RELEASE_HEADER = /^# .*?\[(v\d+\.\d+\.\d+[^\]]*)\]/;
const TAGLINE_PREFIX = '> ';

/** Map each `vX.Y.Z` in CHANGELOG.md to the blockquote tagline under its header. */
export function parseChangelogTaglines(markdown) {
  const taglines = new Map();
  let version = null;
  for (const line of String(markdown).split('\n')) {
    const header = RELEASE_HEADER.exec(line);
    if (header) {
      version = header[1];
      continue;
    }
    if (version && line.startsWith(TAGLINE_PREFIX)) {
      taglines.set(version, line.slice(TAGLINE_PREFIX.length).trim());
      version = null;
    }
  }
  return taglines;
}

/** Replace a service-error tagline line in a release body; null when there is none. */
export function replaceErrorTagline(body, tagline) {
  const lines = String(body ?? '').split('\n');
  const index = lines.findIndex(
    (line) => line.startsWith(TAGLINE_PREFIX) && isServiceError(line.slice(TAGLINE_PREFIX.length))
  );
  if (index === -1) return null;
  lines[index] = `${TAGLINE_PREFIX}${tagline}`;
  return lines.join('\n');
}

async function github(fetchFn, token, path, init = {}) {
  const response = await fetchFn(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} failed with ${response.status}`);
  }
  return response.json();
}

async function listReleases(fetchFn, token, repo) {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await github(
      fetchFn,
      token,
      `/repos/${repo}/releases?per_page=${PER_PAGE}&page=${page}`
    );
    all.push(...batch);
    if (batch.length < PER_PAGE) return all;
  }
}

/**
 * @param {{
 *   changelog: string,
 *   repo: string,
 *   token: string,
 *   apply?: boolean,
 *   fetchFn?: (url: string, init?: object) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>,
 *   logger?: { info: (msg: string) => void, warn: (msg: string) => void },
 * }} args
 * @returns {Promise<{ updated: string[], missing: string[] }>} tags fixed (or
 *   that would be, in dry-run) and tags whose CHANGELOG tagline is still an
 *   error or absent, so nothing could replace it.
 */
export async function backfillReleaseTaglines({
  changelog,
  repo,
  token,
  apply = false,
  fetchFn = fetch,
  logger = console,
}) {
  const taglines = parseChangelogTaglines(changelog);
  const updated = [];
  const missing = [];
  for (const release of await listReleases(fetchFn, token, repo)) {
    const tagline = taglines.get(release.tag_name);
    if (!tagline || isServiceError(tagline)) {
      if (replaceErrorTagline(release.body, '') !== null) missing.push(release.tag_name);
      continue;
    }
    const body = replaceErrorTagline(release.body, tagline);
    if (body === null) continue;
    updated.push(release.tag_name);
    logger.info(`${apply ? 'Updating' : 'Would update'} ${release.tag_name}: > ${tagline}`);
    if (apply) {
      await github(fetchFn, token, `/repos/${repo}/releases/${release.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
    }
  }
  for (const tag of missing) {
    logger.warn(`${tag}: release tagline is an error but CHANGELOG.md has no fix for it`);
  }
  return { updated, missing };
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(args) {
  const repo = argValue(args, '--repo') ?? process.env.GITHUB_REPOSITORY ?? 'shep-ai/shep';
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) throw new Error('Set GITHUB_TOKEN (contents: write) to read and edit releases.');
  const changelog = readFileSync(argValue(args, '--changelog') ?? 'CHANGELOG.md', 'utf8');
  const apply = args.includes('--apply');
  const { updated, missing } = await backfillReleaseTaglines({ changelog, repo, token, apply });
  console.info(
    `${apply ? 'Updated' : 'Would update'} ${updated.length} release(s); ${missing.length} still need a CHANGELOG.md tagline.`
  );
  if (missing.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  });
}
