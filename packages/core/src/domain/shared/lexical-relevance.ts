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
