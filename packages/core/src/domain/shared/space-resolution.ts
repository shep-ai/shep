/**
 * Space resolution (spec 120): which space, and optionally which product line,
 * a repository belongs to.
 *
 * Order: an explicit assignment beats every rule; otherwise the most specific
 * matching rule wins; otherwise the default space applies. Resolution never
 * fails, so every repository is always in exactly one space.
 *
 * This module is the boundary that keeps one space's knowledge away from
 * another's, so it is pure (no I/O, no third-party imports) and tested
 * exhaustively. Per the domain/ convention, relative imports carry no extension.
 */

import { SpaceResolutionSource, SpaceRuleKind } from '../generated/output';
import { normalizePath } from './normalize-path';
import { isAbsolutePath } from './absolute-path';

/** Fixed id of the space created by migration 152 as "Default". */
export const DEFAULT_SPACE_ID = '00000000-0000-4000-8000-000000000120';

/** Tie-breaker priority given to rules created without one. */
export const DEFAULT_SPACE_RULE_PRIORITY = 100;

/** Specificity points for one literal path or remote segment. */
const LITERAL_SEGMENT_SCORE = 2;
/** Specificity points for a segment containing a single-segment wildcard. */
const WILDCARD_SEGMENT_SCORE = 1;
/** The multi-segment wildcard, valid only as a whole segment. */
const ANY_SEGMENTS = '**';

/** The parts of a SpaceRule that resolution needs. */
export interface SpaceRuleInput {
  id: string;
  spaceId: string;
  productLineId?: string;
  kind: SpaceRuleKind;
  pattern: string;
  priority: number;
}

/** The parts of a RepositorySpaceAssignment that resolution needs. */
export interface SpaceAssignmentInput {
  spaceId: string;
  productLineId?: string;
}

/** Everything resolution looks at for one repository. */
export interface ResolveSpaceInput {
  repositoryPath: string;
  remoteUrl?: string;
  assignment?: SpaceAssignmentInput;
  rules: readonly SpaceRuleInput[];
  defaultSpaceId: string;
}

/** Where a repository belongs and why. */
export interface ResolvedSpace {
  spaceId: string;
  productLineId?: string;
  source: SpaceResolutionSource;
  /** The deciding rule, when `source` is `Rule`. */
  ruleId?: string;
}

/**
 * Canonical form of a repository path for space matching: forward slashes, no
 * trailing slash, and a lower-case Windows drive letter.
 */
export function normalizeSpacePath(path: string): string {
  const normalized = normalizePath(path.trim());
  return /^[A-Za-z]:/.test(normalized)
    ? normalized[0].toLowerCase() + normalized.slice(1)
    : normalized;
}

/**
 * Windows paths (drive letter or UNC) are case-insensitive, so they compare in
 * lower case; POSIX paths compare exactly. Expects a normalised path.
 */
function comparablePath(normalizedPath: string): string {
  const isWindowsPath = /^[a-z]:\//i.test(normalizedPath) || normalizedPath.startsWith('//');
  return isWindowsPath ? normalizedPath.toLowerCase() : normalizedPath;
}

/**
 * The key two repository paths share exactly when they are the same
 * repository: normalised, with Windows paths folded to lower case. Use it for
 * any map or lookup keyed by repository path.
 */
export function spacePathKey(path: string): string {
  return comparablePath(normalizeSpacePath(path));
}

/**
 * Canonical form of a git remote for space matching: `host/owner/repo`,
 * lower-case, with no scheme, credentials, `.git` suffix or trailing slash.
 * Accepts https, ssh and scp-style (`git@host:owner/repo`) spellings.
 */
export function normalizeRemoteUrlForSpace(url: string): string {
  let value = url.trim().toLowerCase();
  if (!value) return '';
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^[^@/]+@/, '');
  value = value.replace(/^([^/:]+):(?!\d+\/)/, '$1/');
  value = value.replace(/\/+$/, '').replace(/\.git$/, '');
  return value;
}

/**
 * The rule kind a pattern most likely means: an absolute path is a Path rule,
 * anything else (host/owner, scp or URL form) is a Remote rule.
 */
export function inferSpaceRuleKind(pattern: string): SpaceRuleKind {
  return isAbsolutePath(pattern.trim()) ? SpaceRuleKind.Path : SpaceRuleKind.Remote;
}

/** Normalise a rule pattern the same way its kind normalises what it matches. */
export function normalizeSpaceRulePattern(kind: SpaceRuleKind, pattern: string): string {
  return kind === SpaceRuleKind.Path
    ? normalizeSpacePath(pattern)
    : normalizeRemoteUrlForSpace(pattern);
}

function segments(value: string): string[] {
  return value.split('/').filter((segment, index) => segment !== '' || index === 0);
}

function matchPathRule(pattern: string, repositoryPath: string): number | null {
  const ruleSegments = segments(spacePathKey(pattern));
  const pathSegments = segments(spacePathKey(repositoryPath));
  if (ruleSegments.length === 0 || ruleSegments.length > pathSegments.length) return null;
  const isPrefix = ruleSegments.every((segment, index) => segment === pathSegments[index]);
  return isPrefix ? ruleSegments.length * LITERAL_SEGMENT_SCORE : null;
}

function segmentRegex(segment: string): RegExp {
  const escaped = segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchRemoteSegments(pattern: string[], remote: string[]): number | null {
  if (pattern.length === 0) return remote.length === 0 ? 0 : null;
  const [head, ...rest] = pattern;
  if (head === ANY_SEGMENTS) {
    for (let consumed = 0; consumed <= remote.length; consumed++) {
      const score = matchRemoteSegments(rest, remote.slice(consumed));
      if (score !== null) return score;
    }
    return null;
  }
  if (remote.length === 0 || !segmentRegex(head).test(remote[0])) return null;
  const restScore = matchRemoteSegments(rest, remote.slice(1));
  if (restScore === null) return null;
  return restScore + (head.includes('*') ? WILDCARD_SEGMENT_SCORE : LITERAL_SEGMENT_SCORE);
}

/**
 * How specifically a rule matches a repository, or `null` when it does not.
 * A higher number means a more specific match.
 */
export function matchSpaceRule(
  rule: SpaceRuleInput,
  repositoryPath: string,
  remoteUrl?: string
): number | null {
  if (rule.kind === SpaceRuleKind.Path) return matchPathRule(rule.pattern, repositoryPath);
  const remote = remoteUrl ? normalizeRemoteUrlForSpace(remoteUrl) : '';
  if (!remote) return null;
  return matchRemoteSegments(
    normalizeRemoteUrlForSpace(rule.pattern).split('/'),
    remote.split('/')
  );
}

/** Decide which space (and product line) a repository belongs to. */
export function resolveSpace(input: ResolveSpaceInput): ResolvedSpace {
  if (input.assignment) {
    return withLine(
      { spaceId: input.assignment.spaceId, source: SpaceResolutionSource.Assignment },
      input.assignment.productLineId
    );
  }

  let best: { rule: SpaceRuleInput; score: number } | null = null;
  for (const rule of input.rules) {
    const score = matchSpaceRule(rule, input.repositoryPath, input.remoteUrl);
    if (score === null) continue;
    if (!best || isBetter(rule, score, best.rule, best.score)) best = { rule, score };
  }

  if (best) {
    return withLine(
      { spaceId: best.rule.spaceId, source: SpaceResolutionSource.Rule, ruleId: best.rule.id },
      best.rule.productLineId
    );
  }
  return { spaceId: input.defaultSpaceId, source: SpaceResolutionSource.Default };
}

function isBetter(
  candidate: SpaceRuleInput,
  candidateScore: number,
  current: SpaceRuleInput,
  currentScore: number
): boolean {
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  if (candidate.priority !== current.priority) return candidate.priority < current.priority;
  return candidate.id < current.id;
}

function withLine(resolved: ResolvedSpace, productLineId: string | undefined): ResolvedSpace {
  return productLineId ? { ...resolved, productLineId } : resolved;
}
