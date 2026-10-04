/**
 * Notion blocks → Markdown (spec 125).
 *
 * The Notion client fetches a page's blocks (children attached to their
 * parents) and this converts them, so a knowledge document reads like the
 * page: headings, paragraphs, bulleted, numbered and to-do lists (nested),
 * code, quotes, callouts, toggles, tables, dividers, bookmarks and media.
 * Child pages and databases become references; their own content is synced
 * as their own documents. Unknown blocks keep their text.
 *
 * Pure and dependency-free.
 */

export interface NotionRichText {
  type: string;
  plain_text: string;
  href: string | null;
  annotations: { bold: boolean; italic: boolean; strikethrough: boolean; code: boolean };
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  /** Child blocks, attached by the client. */
  children?: NotionBlock[];
  [type: string]: unknown;
}

const BLOCK_SEPARATOR = '\n\n';
const LIST_INDENT = '  ';

const LIST_TYPES = new Set(['bulleted_list_item', 'numbered_list_item', 'to_do']);

interface BlockValue {
  rich_text?: NotionRichText[];
  checked?: boolean;
  language?: string;
  icon?: { type: string; emoji?: string };
  title?: string;
  url?: string;
  caption?: NotionRichText[];
  cells?: NotionRichText[][];
  has_column_header?: boolean;
}

function valueOf(block: NotionBlock): BlockValue {
  return (block[block.type] ?? {}) as BlockValue;
}

/** Markdown for a run of rich text, with bold, italic, strikethrough, code and links. */
export function richTextToMarkdown(items: NotionRichText[] | undefined): string {
  return (items ?? [])
    .map((item) => {
      let out = item.plain_text;
      if (out === '' || item.type !== 'text') return out;
      const { bold, italic, strikethrough, code } = item.annotations;
      if (code) out = `\`${out}\``;
      if (strikethrough) out = `~~${out}~~`;
      if (italic) out = `_${out}_`;
      if (bold) out = `**${out}**`;
      return item.href ? `[${out}](${item.href})` : out;
    })
    .join('');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : LIST_INDENT + line))
    .join('\n');
}

function listMarker(block: NotionBlock, index: number): string {
  if (block.type === 'numbered_list_item') return `${index + 1}.`;
  if (block.type === 'to_do') return `- [${valueOf(block).checked ? 'x' : ' '}]`;
  return '-';
}

function renderListItem(block: NotionBlock, index: number): string {
  const head = `${listMarker(block, index)} ${richTextToMarkdown(valueOf(block).rich_text)}`;
  const nested = block.children?.length ? notionBlocksToMarkdown(block.children) : '';
  return nested ? `${head}\n${indent(nested)}` : head;
}

function cellText(cell: NotionRichText[]): string {
  return richTextToMarkdown(cell).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

function renderTable(block: NotionBlock): string {
  const rows = (block.children ?? []).map((row) => (valueOf(row).cells ?? []).map(cellText));
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const header = valueOf(block).has_column_header
    ? rows[0]
    : Array.from({ length: width }, () => '');
  const body = valueOf(block).has_column_header ? rows.slice(1) : rows;
  return [line(header), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join(
    '\n'
  );
}

function withChildren(head: string, block: NotionBlock): string {
  const nested = block.children?.length ? notionBlocksToMarkdown(block.children) : '';
  return [head, nested].filter((part) => part !== '').join(BLOCK_SEPARATOR);
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function renderBlock(block: NotionBlock): string {
  const value = valueOf(block);
  const text = richTextToMarkdown(value.rich_text);
  switch (block.type) {
    case 'paragraph':
      return withChildren(text, block);
    case 'heading_1':
      return `# ${text}`;
    case 'heading_2':
      return `## ${text}`;
    case 'heading_3':
      return `### ${text}`;
    case 'quote':
      return prefixLines(withChildren(text, block), '> ');
    case 'callout': {
      const icon = value.icon?.type === 'emoji' && value.icon.emoji ? `${value.icon.emoji} ` : '';
      return prefixLines(withChildren(`${icon}${text}`, block), '> ');
    }
    case 'toggle':
      return withChildren(text ? `**${text}**` : '', block);
    case 'code':
      return `\`\`\`${value.language ?? ''}\n${(value.rich_text ?? []).map((t) => t.plain_text).join('')}\n\`\`\``;
    case 'divider':
      return '---';
    case 'table':
      return renderTable(block);
    case 'bookmark':
    case 'embed':
    case 'link_preview':
      return value.url ? `<${value.url}>` : '';
    case 'image':
    case 'video':
    case 'file':
    case 'pdf': {
      const caption = richTextToMarkdown(value.caption);
      return `[${block.type}${caption ? `: ${caption}` : ''}]`;
    }
    case 'child_page':
      return `[page: ${value.title ?? ''}]`;
    case 'child_database':
      return `[database: ${value.title ?? ''}]`;
    default:
      return withChildren(text, block);
  }
}

/** Markdown for a list of sibling blocks; consecutive list items form one list. */
export function notionBlocksToMarkdown(blocks: NotionBlock[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (LIST_TYPES.has(block.type)) {
      const items: string[] = [];
      let position = 0;
      while (index < blocks.length && blocks[index].type === block.type) {
        items.push(renderListItem(blocks[index], position));
        position += 1;
        index += 1;
      }
      parts.push(items.join('\n'));
      continue;
    }
    const rendered = renderBlock(block);
    if (rendered.trim() !== '') parts.push(rendered);
    index += 1;
  }
  return parts.join(BLOCK_SEPARATOR);
}
