import { describe, it, expect } from 'vitest';
import { adfToMarkdown, markdownToAdf } from '@/infrastructure/services/trackers/adf.js';

const doc = (...content: unknown[]) => ({ type: 'doc', version: 1, content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const li = (...content: unknown[]) => ({ type: 'listItem', content });

describe('adfToMarkdown', () => {
  it('returns an empty string for nothing', () => {
    expect(adfToMarkdown(undefined)).toBe('');
    expect(adfToMarkdown(null)).toBe('');
    expect(adfToMarkdown(doc())).toBe('');
  });

  it('passes a plain string through (Jira v2 descriptions)', () => {
    expect(adfToMarkdown('already text')).toBe('already text');
  });

  it('renders paragraphs, headings and hard breaks', () => {
    const adf = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Steps')] },
      p(text('one'), { type: 'hardBreak' }, text('two')),
      p(text('three'))
    );
    expect(adfToMarkdown(adf)).toBe('## Steps\n\none\ntwo\n\nthree');
  });

  it('renders marks: bold, italic, code, strike, links', () => {
    const adf = doc(
      p(
        text('b', [{ type: 'strong' }]),
        text(' '),
        text('i', [{ type: 'em' }]),
        text(' '),
        text('c', [{ type: 'code' }]),
        text(' '),
        text('s', [{ type: 'strike' }]),
        text(' '),
        text('docs', [{ type: 'link', attrs: { href: 'https://x.dev' } }])
      )
    );
    expect(adfToMarkdown(adf)).toBe('**b** _i_ `c` ~~s~~ [docs](https://x.dev)');
  });

  it('renders nested bullet and ordered lists with indentation and start numbers', () => {
    const adf = doc({
      type: 'bulletList',
      content: [
        li(p(text('a')), {
          type: 'orderedList',
          attrs: { order: 3 },
          content: [li(p(text('x'))), li(p(text('y')))],
        }),
        li(p(text('b'))),
      ],
    });
    expect(adfToMarkdown(adf)).toBe('- a\n  3. x\n  4. y\n- b');
  });

  it('renders task lists', () => {
    const adf = doc({
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { state: 'DONE' }, content: [text('ship')] },
        { type: 'taskItem', attrs: { state: 'TODO' }, content: [text('test')] },
      ],
    });
    expect(adfToMarkdown(adf)).toBe('- [x] ship\n- [ ] test');
  });

  it('renders code blocks, quotes, rules and panels', () => {
    const adf = doc(
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;')] },
      { type: 'blockquote', content: [p(text('quoted'))] },
      { type: 'rule' },
      { type: 'panel', attrs: { panelType: 'warning' }, content: [p(text('careful'))] }
    );
    expect(adfToMarkdown(adf)).toBe(
      '```ts\nconst a = 1;\n```\n\n> quoted\n\n---\n\n> **Warning:** careful'
    );
  });

  it('renders tables with a header row and escapes pipes', () => {
    const cell = (type: string, value: string) => ({ type, content: [p(text(value))] });
    const adf = doc({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'Name'), cell('tableHeader', 'Value')] },
        { type: 'tableRow', content: [cell('tableCell', 'a|b'), cell('tableCell', '1')] },
      ],
    });
    expect(adfToMarkdown(adf)).toBe('| Name | Value |\n| --- | --- |\n| a\\|b | 1 |');
  });

  it('renders inline nodes: mention, emoji, status, date, inline card', () => {
    const adf = doc(
      p(
        { type: 'mention', attrs: { id: 'u1', text: '@Ada' } },
        text(' '),
        { type: 'emoji', attrs: { shortName: ':tada:', text: '🎉' } },
        text(' '),
        { type: 'status', attrs: { text: 'BLOCKED' } },
        text(' '),
        { type: 'date', attrs: { timestamp: '1767225600000' } },
        text(' '),
        { type: 'inlineCard', attrs: { url: 'https://acme.atlassian.net/browse/PAY-1' } }
      )
    );
    expect(adfToMarkdown(adf)).toBe(
      '@Ada 🎉 `BLOCKED` 2026-01-01 <https://acme.atlassian.net/browse/PAY-1>'
    );
  });

  it('renders expands as their title and body, and media as a placeholder', () => {
    const adf = doc(
      { type: 'expand', attrs: { title: 'Logs' }, content: [p(text('trace'))] },
      {
        type: 'mediaSingle',
        content: [{ type: 'media', attrs: { id: 'm1', alt: 'screenshot.png' } }],
      }
    );
    expect(adfToMarkdown(adf)).toBe('**Logs**\n\ntrace\n\n[attachment: screenshot.png]');
  });

  it('keeps the text of unknown nodes', () => {
    expect(adfToMarkdown(doc({ type: 'futureNode', content: [p(text('kept'))] }))).toBe('kept');
  });
});

describe('markdownToAdf', () => {
  it('builds paragraphs, headings, lists, code and links', () => {
    const adf = markdownToAdf(
      '# Title\n\nSee [docs](https://x.dev) now.\n\n- one\n- two\n\n1. first\n\n```js\nx()\n```'
    );
    expect(adf).toEqual({
      type: 'doc',
      version: 1,
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            {
              type: 'text',
              text: 'docs',
              marks: [{ type: 'link', attrs: { href: 'https://x.dev' } }],
            },
            { type: 'text', text: ' now.' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }],
            },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'x()' }] },
      ],
    });
  });

  it('round-trips simple markdown', () => {
    const markdown = '## Steps\n\nOpen [the page](https://x.dev).\n\n- a\n- b';
    expect(adfToMarkdown(markdownToAdf(markdown))).toBe(markdown);
  });

  it('gives an empty document for empty text', () => {
    expect(markdownToAdf('')).toEqual({ type: 'doc', version: 1, content: [] });
  });
});
