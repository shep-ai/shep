/* global fetch, URL */

/**
 * Evidence extraction for release notes.
 *
 * Scans PR descriptions (and commit bodies) for image/video URLs and converts
 * them into markdown that can be embedded directly under each commit line in
 * the release notes. Handles four input shapes:
 *
 *   1. Markdown images:  ![alt](https://...png)
 *   2. HTML media tags:  <img src="..."> / <video src="...">
 *   3. GitHub-hosted attachments uploaded directly into a PR body
 *      (user-attachments, user-images.githubusercontent.com)
 *   4. Bare repo paths to evidence files committed alongside the spec,
 *      e.g. specs/095-feature/evidence/foo.png — these are converted to
 *      raw.githubusercontent.com URLs so they render in the GitHub release.
 *
 * Pure functions only. Network I/O lives in `fetchPrBody`, which the plugin
 * calls; the rest is testable without mocks.
 */

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v'];
const MEDIA_EXTS_GROUP = [...IMAGE_EXTS, ...VIDEO_EXTS].join('|');

const MAX_EVIDENCE_PER_COMMIT = 4;

const MARKDOWN_IMAGE_RE = new RegExp(
  `!\\[([^\\]]*)\\]\\(([^)\\s]+\\.(?:${MEDIA_EXTS_GROUP})(?:\\?[^)\\s]*)?)\\)`,
  'gi'
);
const HTML_IMG_RE = new RegExp(
  `<img\\s+[^>]*src=["']([^"']+\\.(?:${IMAGE_EXTS.join('|')})(?:\\?[^"']*)?)["'][^>]*?/?>`,
  'gi'
);
const HTML_VIDEO_RE = new RegExp(
  `<video\\s+[^>]*src=["']([^"']+\\.(?:${VIDEO_EXTS.join('|')})(?:\\?[^"']*)?)["'][^>]*?/?>`,
  'gi'
);
const GITHUB_USER_ATTACHMENT_RE = /https:\/\/github\.com\/user-attachments\/assets\/[a-z0-9-]+/gi;
const GITHUB_USER_IMAGE_RE = new RegExp(
  `https:\\/\\/(?:user-images|private-user-images)\\.githubusercontent\\.com\\/[^\\s)\\]"']+\\.(?:${MEDIA_EXTS_GROUP})(?:\\?[^\\s)\\]"']*)?`,
  'gi'
);
const REPO_EVIDENCE_PATH_RE = new RegExp(
  `(?:^|[\\s(\`"|])((?:specs|docs|evidence)\\/[a-zA-Z0-9._/-]+\\.(?:${MEDIA_EXTS_GROUP}))`,
  'gi'
);

function isVideoUrl(url) {
  const lower = url.toLowerCase().split('?')[0];
  return VIDEO_EXTS.some((ext) => lower.endsWith(`.${ext}`));
}

const RAW_HOST = 'raw.githubusercontent.com';
const GITHUB_HOST = 'github.com';
const BLOB_OR_RAW_SEGMENTS = new Set(['blob', 'raw']);

// Top-level repo directories evidence lives under. Used to find where the
// (possibly multi-segment) git ref ends and the repo-relative path begins —
// a branch like `feat/aspm-platform` is two path segments, so we cannot split
// ref-from-path positionally. Kept in sync with REPO_EVIDENCE_PATH_RE.
const EVIDENCE_PATH_ROOTS = new Set(['specs', 'docs', 'evidence']);

/**
 * Recover the repo-relative path from a GitHub URL's path segments, tolerating
 * multi-segment branch refs. Prefers the first known evidence root; falls back
 * to assuming the ref is a single segment starting at `fallbackStart`.
 */
function recoverRepoPath(segments, fallbackStart) {
  for (let i = fallbackStart; i < segments.length; i += 1) {
    if (EVIDENCE_PATH_ROOTS.has(segments[i])) {
      return segments.slice(i).join('/');
    }
  }
  return segments.slice(fallbackStart).join('/');
}

/**
 * Rewrite a GitHub-hosted media URL that points at THIS repo so it references
 * a stable, permanent ref (the release tag / commit) instead of whatever ref
 * the PR author happened to embed.
 *
 * PR bodies frequently embed evidence with branch-pinned URLs like
 * `raw.githubusercontent.com/owner/repo/feat/my-branch/...png`. Once the PR is
 * squash-merged the feature branch is deleted and the image 404s. Pinning to
 * the release ref keeps the image resolving forever, because the evidence
 * files committed in that PR exist at the release commit on the default branch.
 *
 * Non-repo URLs (external CDNs, github user-attachments, user-images) are
 * returned unchanged — those are already immutable.
 *
 * @param {string} url
 * @param {{ owner?: string, repo?: string, ref?: string }} opts
 * @returns {string}
 */
export function normalizeRepoMediaUrl(url, { owner, repo, ref } = {}) {
  if (!url || !owner || !repo || !ref) return url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  const repoMatches =
    `${segments[0]}/${segments[1]}`.toLowerCase() === `${owner}/${repo}`.toLowerCase();
  if (!repoMatches) return url;

  // raw.githubusercontent.com/{owner}/{repo}/{ref}/{path...}
  if (parsed.hostname === RAW_HOST && segments.length >= 4) {
    const path = recoverRepoPath(segments, 3);
    return `https://${RAW_HOST}/${owner}/${repo}/${ref}/${path}${parsed.search}`;
  }

  // github.com/{owner}/{repo}/(blob|raw)/{ref}/{path...} → serve raw bytes
  if (
    parsed.hostname === GITHUB_HOST &&
    segments.length >= 5 &&
    BLOB_OR_RAW_SEGMENTS.has(segments[2])
  ) {
    const path = recoverRepoPath(segments, 4);
    return `https://${RAW_HOST}/${owner}/${repo}/${ref}/${path}`;
  }

  return url;
}

function deriveAlt(url) {
  const fileName = url.split('?')[0].split('/').pop() || 'evidence';
  return (
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'evidence'
  );
}

/**
 * Extract evidence URLs from a PR body or commit body string.
 *
 * @param {string} body — raw markdown body (PR description, commit body)
 * @param {{ owner?: string, repo?: string, defaultBranch?: string, ref?: string }} [opts] — repo info.
 *        `ref` is the stable release ref (tag/commit) that branch-pinned repo
 *        URLs are normalized to; falls back to `defaultBranch`.
 * @returns {Array<{ url: string, alt: string, kind: 'image' | 'video' }>}
 */
export function extractEvidenceFromBody(body, opts = {}) {
  const { owner, repo, defaultBranch = 'main' } = opts;
  const ref = opts.ref || defaultBranch;
  if (typeof body !== 'string' || body.trim() === '') return [];

  const evidence = [];
  const seen = new Set();

  function add(rawUrl, alt) {
    if (!rawUrl) return;
    const url = normalizeRepoMediaUrl(rawUrl.trim(), { owner, repo, ref });
    if (seen.has(url)) return;
    seen.add(url);
    evidence.push({
      url,
      alt: alt && alt.trim() ? alt.trim() : deriveAlt(url),
      kind: isVideoUrl(url) ? 'video' : 'image',
    });
  }

  for (const match of body.matchAll(MARKDOWN_IMAGE_RE)) {
    add(match[2], match[1]);
  }
  for (const match of body.matchAll(HTML_IMG_RE)) {
    add(match[1]);
  }
  for (const match of body.matchAll(HTML_VIDEO_RE)) {
    add(match[1]);
  }
  for (const match of body.matchAll(GITHUB_USER_ATTACHMENT_RE)) {
    add(match[0]);
  }
  for (const match of body.matchAll(GITHUB_USER_IMAGE_RE)) {
    add(match[0]);
  }

  if (owner && repo) {
    for (const match of body.matchAll(REPO_EVIDENCE_PATH_RE)) {
      const path = match[1];
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
      add(rawUrl);
    }
  }

  return evidence.slice(0, MAX_EVIDENCE_PER_COMMIT);
}

/**
 * Render one evidence item as a markdown snippet. Videos are rendered as
 * a link (GitHub releases don't auto-embed mp4s reliably); images use
 * the standard markdown image syntax.
 */
export function formatEvidenceMarkdown(item) {
  if (!item || !item.url) return '';
  if (item.kind === 'video' || isVideoUrl(item.url)) {
    return `[\u{1F4F9} ${item.alt}](${item.url})`;
  }
  return `![${item.alt}](${item.url})`;
}

/**
 * Pull PR numbers off a parsed conventional commit. Squash merges land on
 * main with a `(#NNN)` suffix in the subject; conventional-changelog also
 * exposes parsed `references[].issue`. We union both to be robust.
 */
export function getPrNumbersFromCommit(commit) {
  const numbers = new Set();

  if (Array.isArray(commit.references)) {
    for (const ref of commit.references) {
      if (ref && ref.issue) numbers.add(String(ref.issue));
    }
  }

  for (const field of [commit.subject, commit.header, commit.message]) {
    if (typeof field !== 'string') continue;
    for (const match of field.matchAll(/#(\d+)/g)) {
      numbers.add(match[1]);
    }
  }

  return Array.from(numbers);
}

/**
 * Fetch a PR body via the GitHub REST API. Returns null on any failure so
 * callers degrade gracefully — release notes are best-effort enrichment.
 *
 * @param {{
 *   owner: string,
 *   repo: string,
 *   prNumber: string | number,
 *   token: string,
 *   fetcher?: typeof fetch,
 * }} args
 * @returns {Promise<string | null>}
 */
export async function fetchPrBody({ owner, repo, prNumber, token, fetcher = fetch }) {
  if (!owner || !repo || !prNumber || !token) return null;
  try {
    const response = await fetcher(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'shep-release-notes',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.body === 'string' ? data.body : '';
  } catch {
    return null;
  }
}

/**
 * Augment commits with evidence pulled from their referenced PR bodies.
 * Mutates each commit object with an `evidenceMarkdown: string[]` field
 * the writer template renders.
 *
 * @returns The same commits array, mutated in place.
 */
export async function attachEvidenceToCommits(commits, options = {}) {
  const { owner, repo, token, fetcher, defaultBranch, ref } = options;
  if (!Array.isArray(commits) || commits.length === 0) return commits;
  if (!owner || !repo || !token) return commits;

  for (const commit of commits) {
    const prNumbers = getPrNumbersFromCommit(commit);
    if (prNumbers.length === 0) continue;

    const all = [];
    for (const prNumber of prNumbers) {
      const body = await fetchPrBody({ owner, repo, prNumber, token, fetcher });
      if (!body) continue;
      const items = extractEvidenceFromBody(body, { owner, repo, defaultBranch, ref });
      all.push(...items);
      if (all.length >= MAX_EVIDENCE_PER_COMMIT) break;
    }

    if (all.length > 0) {
      const seen = new Set();
      const deduped = [];
      for (const item of all) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        deduped.push(item);
        if (deduped.length >= MAX_EVIDENCE_PER_COMMIT) break;
      }
      commit.evidence = deduped;
      commit.evidenceMarkdown = deduped.map(formatEvidenceMarkdown);
    }
  }

  return commits;
}

export const __test__ = {
  MARKDOWN_IMAGE_RE,
  HTML_IMG_RE,
  HTML_VIDEO_RE,
  GITHUB_USER_ATTACHMENT_RE,
  REPO_EVIDENCE_PATH_RE,
  isVideoUrl,
  deriveAlt,
  normalizeRepoMediaUrl,
  MAX_EVIDENCE_PER_COMMIT,
};
