import { describe, it, expect } from 'vitest';
import {
  notionBlocksToMarkdown,
  richTextToMarkdown,
  type NotionBlock,
  type NotionRichText,
} from '@/infrastructure/services/knowledge/notion-blocks.js';

function text(content: string, over: Partial<NotionRichText> = {}): NotionRichText {
  return {
    type: 'text',
    plain_text: content,
    href: null,
    annotations: { bold: false, italic: false, strikethrough: false, code: false },
    ...over,
  };
}

function block(
  type: string,
  value: Record<string, unknown>,
  children?: NotionBlock[]
): NotionBlock {
  return {
    id: `${type}-id`,
    type,
    has_children: Boolean(children),
    [type]: value,
    ...(children ? { children } : {}),
  };
}

const rich = (content: string) => ({ rich_text: [text(content)] });

describe('richTextToMarkdown', () => {
  it('applies annotations and links', () => {
    expect(
      richTextToMarkdown([
        text('plain '),
        text('bold', {
          annotations: { bold: true, italic: false, strikethrough: false, code: false },
        }),
        text(' and '),
        text('code', {
          annotations: { bold: false, italic: false, strikethrough: false, code: true },
        }),
        text(' '),
        text('gone', {
          annotations: { bold: false, italic: true, strikethrough: true, code: false },
        }),
        text(' '),
        text('docs', { href: 'https://example.com' }),
      ])
    ).toBe('plain **bold** and `code` _~~gone~~_ [docs](https://example.com)');
  });

  it('renders mentions and equations by their text', () => {
    expect(
      richTextToMarkdown([
        { type: 'mention', plain_text: '@Ada', href: null, annotations: text('').annotations },
        text(' paid '),
        { type: 'equation', plain_text: 'x^2', href: null, annotations: text('').annotations },
      ])
    ).toBe('@Ada paid x^2');
  });
});

describe('notionBlocksToMarkdown', () => {
  it('renders headings, paragraphs, quotes, callouts and dividers', () => {
    expect(
      notionBlocksToMarkdown([
        block('heading_1', rich('Refunds')),
        block('paragraph', rich('Guests can refund.')),
        block('heading_2', rich('Rules')),
        block('heading_3', rich('Edge cases')),
        block('quote', rich('Never refund twice.')),
        block('callout', { ...rich('Ask finance first.'), icon: { type: 'emoji', emoji: '⚠️' } }),
        block('divider', {}),
      ])
    ).toBe(
      '# Refunds\n\nGuests can refund.\n\n## Rules\n\n### Edge cases\n\n> Never refund twice.\n\n> ⚠️ Ask finance first.\n\n---'
    );
  });

  it('renders consecutive list items as one list, numbering ordered ones, nesting children', () => {
    expect(
      notionBlocksToMarkdown([
        block('bulleted_list_item', rich('one'), [block('bulleted_list_item', rich('one.a'))]),
        block('bulleted_list_item', rich('two')),
        block('numbered_list_item', rich('first')),
        block('numbered_list_item', rich('second')),
        block('to_do', { ...rich('ship'), checked: true }),
        block('to_do', { ...rich('measure'), checked: false }),
      ])
    ).toBe('- one\n  - one.a\n- two\n\n1. first\n2. second\n\n- [x] ship\n- [ ] measure');
  });

  it('renders code, toggles, tables, bookmarks, images and child pages', () => {
    expect(
      notionBlocksToMarkdown([
        block('code', { ...rich('const a = 1;'), language: 'typescript' }),
        block('toggle', rich('Details'), [block('paragraph', rich('Hidden text'))]),
        block('table', { has_column_header: true }, [
          block('table_row', { cells: [[text('Plan')], [text('Price')]] }),
          block('table_row', { cells: [[text('Pro')], [text('$10 | month')]] }),
        ]),
        block('bookmark', { url: 'https://acme.com/pricing', caption: [] }),
        block('image', {
          type: 'external',
          external: { url: 'https://img' },
          caption: [text('Flow')],
        }),
        block('child_page', { title: 'Runbook' }),
        block('child_database', { title: 'Incidents' }),
      ])
    ).toBe(
      [
        '```typescript\nconst a = 1;\n```',
        '**Details**\n\nHidden text',
        '| Plan | Price |\n| --- | --- |\n| Pro | $10 \\| month |',
        '<https://acme.com/pricing>',
        '[image: Flow]',
        '[page: Runbook]',
        '[database: Incidents]',
      ].join('\n\n')
    );
  });

  it('keeps the text of unknown blocks and drops empty ones', () => {
    expect(
      notionBlocksToMarkdown([
        block('synced_block', {}, [block('paragraph', rich('synced text'))]),
        block('paragraph', { rich_text: [] }),
        block('mystery', rich('mystery text')),
      ])
    ).toBe('synced text\n\nmystery text');
  });
});
