/**
 * Knowledge rules (spec 125): how a synced document is split into passages
 * and which passages fit a task best.
 *
 * Passages follow the document's headings, so each carries the section it
 * came from; long sections are cut at paragraph boundaries. Ranking is
 * lexical: query terms found in a passage count by rarity across the
 * passages, and more in its title or heading.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

/** Minutes between automatic syncs of a knowledge source: default and bounds. */
export const DEFAULT_KNOWLEDGE_INTERVAL_MINUTES = 60;
export const MIN_KNOWLEDGE_INTERVAL_MINUTES = 15;
export const MAX_KNOWLEDGE_INTERVAL_MINUTES = 1440;

/** Most pages one knowledge source keeps. */
export const MAX_KNOWLEDGE_PAGES_PER_SOURCE = 500;

/** Longest document stored; the rest of a page is cut. */
export const MAX_DOCUMENT_CHARS = 100_000;

/** Longest passage handed to an agent. */
export const MAX_PASSAGE_CHARS = 1_200;

/** Title and heading terms weigh this much more than body terms. */
const HEADING_WEIGHT = 1.5;

const MIN_TERM_LENGTH = 3;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HEADING_SEPARATOR = ' › ';

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

export interface KnowledgeDocumentText {
  title: string;
  url: string;
  content: string;
}

export interface KnowledgePassage {
  title: string;
  url: string;
  /** Heading path such as "Guests › Limits"; unset before the first heading. */
  heading?: string;
  text: string;
}

function chunk(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of text.split(/\n{2,}/)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_PASSAGE_CHARS) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    let rest = paragraph;
    while (rest.length > MAX_PASSAGE_CHARS) {
      chunks.push(rest.slice(0, MAX_PASSAGE_CHARS));
      rest = rest.slice(MAX_PASSAGE_CHARS);
    }
    current = rest;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** The document's passages, in order, each under its heading path. */
export function splitIntoPassages(document: KnowledgeDocumentText): KnowledgePassage[] {
  const passages: KnowledgePassage[] = [];
  const path: string[] = [];
  let body: string[] = [];

  const flush = () => {
    const text = body.join('\n').trim();
    body = [];
    if (!text) return;
    const heading = path.filter(Boolean).join(HEADING_SEPARATOR);
    for (const part of chunk(text)) {
      passages.push({
        title: document.title,
        url: document.url,
        ...(heading ? { heading } : {}),
        text: part,
      });
    }
  };

  for (const line of document.content.replace(/\r\n/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    if (!heading) {
      body.push(line);
      continue;
    }
    flush();
    const level = heading[1].length;
    path.length = level - 1;
    path[level - 1] = heading[2].trim();
  }
  flush();
  return passages;
}

function terms(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .map((term) => term.replace(/(ies|es|s)$/, (suffix) => (suffix === 'ies' ? 'y' : '')))
      .filter((term) => term.length >= MIN_TERM_LENGTH && !STOPWORDS.has(term))
  );
}

/** Passages sharing terms with the query, best first; none for an empty query. */
export function rankPassages(query: string, passages: KnowledgePassage[]): KnowledgePassage[] {
  const queryTerms = terms(query);
  if (queryTerms.size === 0 || passages.length === 0) return [];

  const indexed = passages.map((passage) => ({
    passage,
    body: terms(passage.text),
    heading: terms(`${passage.title} ${passage.heading ?? ''}`),
  }));
  const rarity = new Map<string, number>();
  for (const term of queryTerms) {
    const found = indexed.filter((item) => item.body.has(term) || item.heading.has(term)).length;
    rarity.set(term, found === 0 ? 0 : Math.log(1 + passages.length / found));
  }

  return indexed
    .map((item, order) => {
      let score = 0;
      for (const term of queryTerms) {
        const weight = rarity.get(term) ?? 0;
        if (item.body.has(term)) score += weight;
        if (item.heading.has(term)) score += weight * HEADING_WEIGHT;
      }
      return { passage: item.passage, score, order };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((item) => item.passage);
}
