/* global process, console */

/**
 * Claude-powered tagline generator for release notes.
 *
 * The default release tagline is static — every release reads "Run multiple
 * AI agents in parallel — each in its own worktree, branch, and PR. Zero
 * context-switching, zero merge chaos." That gets stale fast and gives no
 * signal about what THIS particular release shipped.
 *
 * This module asks Claude to write a one-line, dev-rel-friendly tagline
 * grounded in the actual commits of the release, using the @anthropic-ai/
 * claude-agent-sdk that's already a dependency. If the SDK is unavailable
 * (no token, sandboxed env, transient failure) we return null and the
 * plugin falls back to the static tagline.
 *
 * Pure dependency injection on the `claudeQuery` argument so tests don't
 * spawn the real Claude CLI.
 */

export const STATIC_TAGLINE =
  'Run multiple AI agents in parallel — each in its own worktree, branch, and PR. _Zero context-switching, zero merge chaos._';

const RELEVANT_COMMIT_TYPES = new Set(['feat', 'fix', 'perf']);
const MAX_COMMITS_IN_PROMPT = 30;
const TAGLINE_MAX_CHARS = 200;

function summarizeCommits(commits) {
  return commits
    .filter((c) => c && c.subject && RELEVANT_COMMIT_TYPES.has(c.type))
    .slice(0, MAX_COMMITS_IN_PROMPT)
    .map((c) => `- ${c.type}${c.scope ? `(${c.scope})` : ''}: ${stripMarkdownLinks(c.subject)}`)
    .join('\n');
}

function stripMarkdownLinks(subject) {
  return String(subject).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Does this release ship anything a user would see? `feat`/`fix`/`perf`
 * commits all surface in the release's changelog sections, so a tagline that
 * calls the release "maintenance only" / "no user-facing changes" would
 * directly contradict the notes printed right below it.
 */
function hasUserFacingChanges(commits) {
  return (commits || []).some((c) => c && RELEVANT_COMMIT_TYPES.has(c.type));
}

// Framings that are only honest for a chore-only release. If the release
// actually ships features/fixes, a tagline matching any of these contradicts
// the changelog and must be rejected in favor of the static fallback.
const MAINTENANCE_ONLY_PATTERNS = [
  /no user-facing/i,
  /under the hood/i,
  /housekeeping/i,
  /maintenance (?:release|only|and)/i,
  /nothing user-facing/i,
  /behind the scenes/i,
];

function isMaintenanceOnlyFraming(tagline) {
  return MAINTENANCE_ONLY_PATTERNS.some((re) => re.test(tagline));
}

function buildPrompt({ commits, version }) {
  const summary = summarizeCommits(commits) || '- (chore-only release)';
  const userFacing = hasUserFacingChanges(commits);
  const naturePromptLines = userFacing
    ? [
        'This release SHIPS user-facing changes — the commits above appear as',
        'Features / Bug Fixes / Performance sections in the published notes. Your',
        'tagline MUST reflect that. NEVER describe it as "maintenance",',
        '"housekeeping", "under the hood", "behind the scenes", or "no user-facing',
        'changes" — even if a change is behind a feature flag, it still shipped.',
      ]
    : [
        'This is a chore-only release with no feature/fix/perf commits. Keep the',
        'tagline modest and honest — do not invent user-facing features.',
      ];
  return [
    `You are writing the one-line tagline for the v${version} release of Shep — an autonomous AI-native SDLC platform that runs parallel AI agents in isolated git worktrees to automate the dev cycle from idea to deploy.`,
    '',
    'The tagline appears immediately below the version header in the GitHub release, before the changelog. It should capture the SOUL of THIS release based on the actual changes — not generic boilerplate.',
    '',
    ...naturePromptLines,
    '',
    'Commits in this release:',
    summary,
    '',
    'Constraints:',
    '- ONE sentence, under 160 characters.',
    '- Concrete and dev-rel friendly: highlight what users actually get.',
    '- Use markdown italics with _underscores_ on at most one phrase for emphasis.',
    '- No emoji at the start. At most one emoji inside the line.',
    '- Do NOT include the leading ">" markdown blockquote character.',
    '- Do NOT prefix with "We\'re excited" / "Introducing" / "In this release".',
    '- Do NOT wrap in quotes.',
    '',
    'Output ONLY the tagline text, nothing else.',
  ].join('\n');
}

function postProcessTagline(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;
  text = text.split(/\r?\n/)[0].trim();
  // Two passes so we can tolerate any order of leading-quote, leading-blockquote,
  // and trailing-quote (Claude occasionally returns >"...".).
  for (let i = 0; i < 2; i += 1) {
    text = text.replace(/^>\s*/, '').trim();
    text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
  }
  if (!text) return null;
  if (text.length > TAGLINE_MAX_CHARS) {
    text = text.slice(0, TAGLINE_MAX_CHARS - 1).trimEnd() + '…';
  }
  return text;
}

async function loadDefaultClaudeQuery() {
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    return typeof sdk.query === 'function' ? sdk.query : null;
  } catch {
    return null;
  }
}

function hasAuthCredentials(env = process.env) {
  return Boolean(
    env.CLAUDE_CODE_OAUTH_TOKEN ||
      env.ANTHROPIC_API_KEY ||
      env.CLAUDE_API_KEY ||
      env.ANTHROPIC_AUTH_TOKEN
  );
}

async function runQuery(claudeQuery, prompt, options) {
  const messages = claudeQuery({
    prompt,
    options: {
      cwd: process.cwd(),
      tools: [],
      ...options,
    },
  });

  let result = '';
  let assistantText = '';
  for await (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (
      message.type === 'result' &&
      message.subtype === 'success' &&
      typeof message.result === 'string'
    ) {
      result = message.result;
      break;
    }
    if (message.type === 'assistant' && message.message && Array.isArray(message.message.content)) {
      for (const block of message.message.content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          assistantText += block.text;
        }
      }
    }
  }

  return result || assistantText;
}

/**
 * Generate a release tagline from commits. Returns null on any failure so
 * the caller can substitute the static tagline.
 *
 * @param {{
 *   commits: Array<{ type?: string, scope?: string, subject?: string }>,
 *   version: string,
 *   claudeQuery?: Function,
 *   queryOptions?: object,
 *   logger?: { warn?: Function, info?: Function },
 *   env?: NodeJS.ProcessEnv,
 * }} args
 * @returns {Promise<string | null>}
 */
export async function generateTagline({
  commits = [],
  version,
  claudeQuery,
  queryOptions,
  logger = console,
  env = process.env,
}) {
  if (!version) return null;
  if (!hasAuthCredentials(env)) {
    logger.info?.('[release-notes] Claude credentials not present; using static tagline.');
    return null;
  }

  const queryFn = claudeQuery || (await loadDefaultClaudeQuery());
  if (!queryFn) {
    logger.warn?.(
      '[release-notes] @anthropic-ai/claude-agent-sdk not available; using static tagline.'
    );
    return null;
  }

  try {
    const prompt = buildPrompt({ commits, version });
    const raw = await runQuery(queryFn, prompt, queryOptions);
    const tagline = postProcessTagline(raw);
    if (!tagline) {
      logger.warn?.('[release-notes] Claude returned empty tagline; using static tagline.');
      return null;
    }
    if (hasUserFacingChanges(commits) && isMaintenanceOnlyFraming(tagline)) {
      logger.warn?.(
        `[release-notes] Claude tagline framed a user-facing release as maintenance ("${tagline}"); using static tagline.`
      );
      return null;
    }
    logger.info?.(`[release-notes] Generated tagline via Claude: ${tagline}`);
    return tagline;
  } catch (err) {
    logger.warn?.(`[release-notes] Claude tagline generation failed: ${err?.message ?? err}`);
    return null;
  }
}

export const __test__ = {
  buildPrompt,
  postProcessTagline,
  summarizeCommits,
  hasAuthCredentials,
  hasUserFacingChanges,
  isMaintenanceOnlyFraming,
  STATIC_TAGLINE,
};
