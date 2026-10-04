import { describe, it, expect } from 'vitest';
import {
  MAX_PASSAGE_CHARS,
  rankPassages,
  splitIntoPassages,
  type KnowledgePassage,
} from '@/domain/shared/knowledge.js';

const DOC = { title: 'Refund policy', url: 'https://notion.so/refunds' };

describe('splitIntoPassages', () => {
  it('splits under headings, keeping the heading path', () => {
    const passages = splitIntoPassages({
      ...DOC,
      content:
        'Intro line.\n\n# Guests\n\nGuests refund by email.\n\n## Limits\n\nUp to 30 days.\n\n# Staff\n\nStaff ask finance.',
    });
    expect(passages.map((p) => [p.heading, p.text])).toEqual([
      [undefined, 'Intro line.'],
      ['Guests', 'Guests refund by email.'],
      ['Guests › Limits', 'Up to 30 days.'],
      ['Staff', 'Staff ask finance.'],
    ]);
    expect(passages[0]).toMatchObject({ title: DOC.title, url: DOC.url });
  });

  it('cuts long sections at paragraph boundaries, and hard-cuts a single huge paragraph', () => {
    const paragraph = 'word '.repeat(150).trim();
    const passages = splitIntoPassages({
      ...DOC,
      content: [paragraph, paragraph, paragraph].join('\n\n'),
    });
    expect(passages.length).toBeGreaterThan(1);
    expect(passages.every((p) => p.text.length <= MAX_PASSAGE_CHARS)).toBe(true);

    const huge = splitIntoPassages({ ...DOC, content: 'x'.repeat(MAX_PASSAGE_CHARS * 2 + 10) });
    expect(huge.map((p) => p.text.length)).toEqual([MAX_PASSAGE_CHARS, MAX_PASSAGE_CHARS, 10]);
  });

  it('ignores headings with no text under them and blank documents', () => {
    expect(splitIntoPassages({ ...DOC, content: '# Empty\n\n# Also empty\n' })).toEqual([]);
    expect(splitIntoPassages({ ...DOC, content: '   ' })).toEqual([]);
  });
});

describe('rankPassages', () => {
  const passages: KnowledgePassage[] = [
    { ...DOC, heading: 'Staff', text: 'Staff ask finance before any refund.' },
    { ...DOC, heading: 'Guests', text: 'Guest orders are refunded to the email on the order.' },
    { title: 'Pricing', url: 'u', text: 'Plans cost ten dollars a month.' },
    { title: 'Guest checkout', url: 'u2', text: 'Checkout without an account.' },
  ];

  it('ranks by shared terms, rarer terms and title or heading matches counting more', () => {
    const ranked = rankPassages('Refund fails for guest orders', passages);
    expect(ranked.map((p) => p.heading ?? p.title)).toEqual(['Guests', 'Staff', 'Guest checkout']);
  });

  it('returns nothing for an empty or unmatched query', () => {
    expect(rankPassages('', passages)).toEqual([]);
    expect(rankPassages('kubernetes autoscaling', passages)).toEqual([]);
  });
});
