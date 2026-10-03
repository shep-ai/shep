/**
 * Lexical relevance helpers shared by project-memory selection and the
 * harness's deterministic decision provider and candidate retrieval.
 */

const MIN_TOKEN_LENGTH = 3;

/** Lowercase alphanumeric tokens of at least three characters, minus stopwords. */
export function tokenizeForRelevance(
  text: string,
  stopwords: ReadonlySet<string> = new Set()
): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= MIN_TOKEN_LENGTH && !stopwords.has(raw)) tokens.add(raw);
  }
  return tokens;
}

/** Saturating overlap → [0,1): 1 match ≈ 0.33, 2 ≈ 0.5, 4 ≈ 0.67. */
export function lexicalOverlapScore(
  queryTokens: ReadonlySet<string>,
  text: string,
  stopwords: ReadonlySet<string> = new Set()
): number {
  if (queryTokens.size === 0) return 0;
  const textTokens = tokenizeForRelevance(text, stopwords);
  let overlap = 0;
  for (const t of queryTokens) {
    if (textTokens.has(t)) overlap += 1;
  }
  return overlap === 0 ? 0 : overlap / (overlap + 2);
}

/** Function words that carry no intent ("the", "and", "with", …). */
export const INTENT_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'that',
  'this',
  'these',
  'those',
  'all',
  'any',
  'are',
  'was',
  'were',
  'has',
  'have',
  'its',
  'our',
  'your',
  'you',
  'then',
  'than',
  'what',
  'which',
  'who',
  'how',
  'why',
  'when',
  'out',
  'off',
  'not',
  'can',
  'via',
  'per',
]);

const MIN_STEM_LENGTH = 3;
/** "-es" is a plural ending only after a sibilant (matches, boxes, fixes). */
const SIBILANT_END = /(s|x|z|ch|sh)$/;

/** Very light stemming so "editing", "edits" and "edited" all match "edit". */
export function stemToken(token: string): string {
  const strip = (suffix: string) => token.slice(0, -suffix.length);
  const long = (suffix: string) =>
    token.endsWith(suffix) && token.length - suffix.length >= MIN_STEM_LENGTH;
  if (long('ing')) return strip('ing');
  if (long('ies')) return `${strip('ies')}y`;
  if (long('es') && SIBILANT_END.test(strip('es'))) return strip('es');
  if (long('ed')) return strip('ed');
  if (long('s') && !token.endsWith('ss')) return strip('s');
  return token;
}

/** Stemmed, stopword-free tokens of a stated intent or a capability description. */
export function intentTokens(text: string): Set<string> {
  const out = new Set<string>();
  // Split camelCase / PascalCase identifiers so `refreshToken` matches "refresh token".
  const split = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  for (const t of tokenizeForRelevance(split, INTENT_STOPWORDS)) out.add(stemToken(t));
  return out;
}

/** {@link lexicalOverlapScore} over stemmed, stopword-free intent tokens. */
export function intentOverlapScore(intent: ReadonlySet<string>, text: string): number {
  if (intent.size === 0) return 0;
  const textTokens = intentTokens(text);
  let overlap = 0;
  for (const t of intent) if (textTokens.has(t)) overlap += 1;
  return overlap === 0 ? 0 : overlap / (overlap + 2);
}
