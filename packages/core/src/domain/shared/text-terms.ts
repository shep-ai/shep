/**
 * Text terms (specs 125, 127): the words of a text that carry meaning —
 * lower-case letters and digits, plurals folded, short words and stopwords
 * dropped. Knowledge ranking and feedback themes compare texts by these.
 *
 * Pure: no I/O.
 */

const MIN_TERM_LENGTH = 3;

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'any',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'had',
  'his',
  'how',
  'its',
  'may',
  'new',
  'now',
  'old',
  'see',
  'two',
  'who',
  'did',
  'get',
  'let',
  'say',
  'she',
  'too',
  'use',
  'with',
  'this',
  'that',
  'from',
  'they',
  'will',
  'have',
  'what',
  'when',
  'were',
  'your',
  'into',
  'than',
  'then',
  'them',
  'been',
  'more',
  'some',
  'only',
  'also',
  'each',
  'which',
  'their',
  'there',
  'about',
  'would',
  'should',
  'could',
  'after',
  'before',
  'over',
  'under',
  'fails',
  'fix',
  'add',
  'make',
]);

/**
 * A plural folded to its singular: stories → story, boxes → box,
 * classes → class, invoices → invoice; status and analysis stay.
 */
function singular(term: string): string {
  return term
    .replace(/ies$/, 'y')
    .replace(/(ch|sh|x|ss)es$/, '$1')
    .replace(/([^siu])s$/, '$1');
}

/** The distinct terms of `text`. */
export function textTerms(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .map(singular)
      .filter((term) => term.length >= MIN_TERM_LENGTH && !STOPWORDS.has(term))
  );
}

/** Jaccard similarity of two term sets: shared terms over all terms; 0 when either is empty. */
export function termSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const term of a) if (b.has(term)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** The terms of a signal's title and detail. */
export function signalTerms(signal: { title: string; detail?: string }): Set<string> {
  return textTerms(`${signal.title} ${signal.detail ?? ''}`);
}
