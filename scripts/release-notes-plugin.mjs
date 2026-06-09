/* global process, console */

/**
 * Custom semantic-release `generateNotes` plugin.
 *
 * Wraps `@semantic-release/release-notes-generator` to produce dev-rel
 * friendly release notes that go beyond static text. Two enhancements:
 *
 *   1. **Claude-generated tagline.** Replaces the hardcoded
 *      "Run multiple AI agents in parallel — …" line with one written by
 *      Claude based on the actual commits in this release. Falls back to
 *      the static tagline when Claude is unavailable (no token, sandbox).
 *
 *   2. **Inline evidence.** When a commit references a PR whose body
 *      contains screenshots or videos (markdown images, HTML media tags,
 *      GitHub user-attachments, or repo-relative `specs/.../evidence/*`
 *      paths), those media URLs are embedded as sub-bullets directly
 *      under the commit line in the release notes.
 *
 * Drop-in replacement for `@semantic-release/release-notes-generator` in
 * release.config.mjs.
 *
 * Side-effect-free pure-config exposure (no top-level await, no env reads
 * at import time) — necessary because semantic-release loads plugins
 * eagerly and our tests import this module directly.
 */

import { generateNotes as baseGenerateNotes } from '@semantic-release/release-notes-generator';
import { writerOpts as baseWriterOpts } from './release-notes-template.mjs';
import { STATIC_TAGLINE } from './release-notes-template.mjs';
import { attachEvidenceToCommits } from './release-notes-evidence.mjs';
import { generateTagline } from './release-notes-claude.mjs';

const DEFAULT_BRANCH = 'main';

function parseRepoFromUrl(repositoryUrl) {
  if (typeof repositoryUrl !== 'string' || repositoryUrl.length === 0) return null;
  const cleaned = repositoryUrl.replace(/\.git$/i, '');
  const match = cleaned.match(/[:/]([^/:]+)\/([^/]+?)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function getRepoInfo(context) {
  const repoUrl = context?.options?.repositoryUrl;
  return parseRepoFromUrl(repoUrl);
}

function getGitHubToken(env) {
  return env.GITHUB_TOKEN || env.GH_TOKEN || env.RELEASE_TOKEN || env.GITHUB_PAT || null;
}

function replaceTagline(notes, tagline) {
  if (!tagline || typeof notes !== 'string') return notes;
  if (tagline.trim() === STATIC_TAGLINE.trim()) return notes;
  return notes.replace(STATIC_TAGLINE, tagline);
}

/**
 * Plugin entrypoint. Same signature as
 * `@semantic-release/release-notes-generator`'s `generateNotes`.
 */
export async function generateNotes(pluginConfig = {}, context = {}) {
  const logger = context.logger || console;
  const env = context.env || process.env;
  const repoInfo = getRepoInfo(context);
  const token = getGitHubToken(env);

  const augmentedCommits = (context.commits || []).map((c) => ({ ...c }));

  if (repoInfo && token) {
    try {
      const defaultBranch = pluginConfig.defaultBranch || DEFAULT_BRANCH;
      // Pin evidence URLs to the immutable release tag so branch-pinned image
      // links in PR bodies keep resolving after the feature branch is deleted.
      const ref = pluginConfig.ref || context.nextRelease?.gitTag || defaultBranch;
      await attachEvidenceToCommits(augmentedCommits, {
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        token,
        fetcher: pluginConfig.fetcher,
        defaultBranch,
        ref,
      });
    } catch (err) {
      logger.warn?.(`[release-notes] evidence enrichment failed: ${err?.message ?? err}`);
    }
  } else if (!token) {
    logger.info?.('[release-notes] no GitHub token in env; skipping evidence enrichment.');
  }

  const mergedWriterOpts = { ...baseWriterOpts, ...(pluginConfig.writerOpts || {}) };

  const baseNotes = await baseGenerateNotes(
    {
      preset: 'angular',
      ...pluginConfig,
      writerOpts: mergedWriterOpts,
    },
    { ...context, commits: augmentedCommits }
  );

  const tagline = await generateTagline({
    commits: augmentedCommits,
    version: context.nextRelease?.version,
    claudeQuery: pluginConfig.claudeQuery,
    queryOptions: pluginConfig.claudeQueryOptions,
    logger,
    env,
  });

  return replaceTagline(baseNotes, tagline);
}

export const __test__ = {
  parseRepoFromUrl,
  replaceTagline,
  getGitHubToken,
};
