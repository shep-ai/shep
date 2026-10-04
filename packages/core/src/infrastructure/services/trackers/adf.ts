/**
 * Atlassian Document Format (ADF) ⇄ Markdown (spec 122).
 *
 * Jira Cloud's REST v3 returns descriptions as ADF and expects ADF back. shep
 * keeps work item descriptions as Markdown, so the Jira client converts in
 * both directions:
 *
 * - adfToMarkdown covers every node Jira's editor produces: paragraphs,
 *   headings, nested bullet / ordered / task lists, code blocks, quotes,
 *   panels, rules, tables, expands, media, mentions, emoji, status lozenges,
 *   dates and smart links. Unknown nodes keep their text.
 * - markdownToAdf covers what shep writes: paragraphs, headings, lists,
 *   fenced code, quotes, links, bold and inline code.
 *
 * Pure and dependency-free.
 */

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: AdfMark[];
  content?: AdfNode[];
}

const BLOCK_SEPARATOR = '\n\n';
const LIST_INDENT = '  ';
const DEFAULT_LIST_START = 1;

/** Inline node types; everything else renders as a block. */
const INLINE_TYPES = new Set([
  'text',
  'hardBreak',
  'mention',
  'emoji',
  'status',
  'date',
  'inlineCard',
  'mediaInline',
]);

// ─── ADF → Markdown ──────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === undefined || value === null
      ? ''
      : String(value);
}

function applyMarks(value: string, marks: AdfMark[] | undefined): string {
  if (!marks || value === '') return value;
  let out = value;
  const has = (type: string) => marks.some((mark) => mark.type === type);
  if (has('code')) out = `\`${out}\``;
  if (has('strike')) out = `~~${out}~~`;
  if (has('em')) out = `_${out}_`;
  if (has('strong')) out = `**${out}**`;
  const link = marks.find((mark) => mark.type === 'link');
  if (link) out = `[${out}](${str(link.attrs?.href)})`;
  return out;
}

function isoDate(timestamp: unknown): string {
  const millis = Number(timestamp);
  return Number.isFinite(millis) ? new Date(millis).toISOString().slice(0, 10) : '';
}

function renderInline(nodes: AdfNode[] | undefined): string {
  return (nodes ?? []).map(renderInlineNode).join('');
}

function renderInlineNode(node: AdfNode): string {
  switch (node.type) {
    case 'text':
      return applyMarks(node.text ?? '', node.marks);
    case 'hardBreak':
      return '\n';
    case 'mention':
      return str(node.attrs?.text) || `@${str(node.attrs?.id)}`;
    case 'emoji':
      return str(node.attrs?.text) || str(node.attrs?.shortName);
    case 'status':
      return `\`${str(node.attrs?.text)}\``;
    case 'date':
      return isoDate(node.attrs?.timestamp);
    case 'inlineCard':
      return `<${str(node.attrs?.url)}>`;
    case 'mediaInline':
      return `[attachment: ${str(node.attrs?.alt) || str(node.attrs?.id)}]`;
    default:
      // Inline content of a node used inline (unknown or block-in-inline).
      return node.content ? renderInline(node.content) : (node.text ?? '');
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : prefix + line))
    .join('\n');
}

/** One list item: its first paragraph after the marker, nested blocks indented under it. */
function renderListItem(item: AdfNode, marker: string): string {
  const children = item.content ?? [];
  const startsWithParagraph = children[0]?.type === 'paragraph';
  const head = startsWithParagraph ? renderInline(children[0].content) : '';
  const nested = (startsWithParagraph ? children.slice(1) : children)
    .map(renderBlock)
    .filter((block) => block !== '')
    .map((block) => indent(block, LIST_INDENT));
  return `${marker} ${[head, ...nested].filter((part) => part !== '').join('\n')}`;
}

function renderList(node: AdfNode): string {
  const ordered = node.type === 'orderedList';
  const start = Number(node.attrs?.order ?? DEFAULT_LIST_START);
  return (node.content ?? [])
    .map((item, index) => renderListItem(item, ordered ? `${start + index}.` : '-'))
    .join('\n');
}

function renderTaskList(node: AdfNode): string {
  return (node.content ?? [])
    .map((item) => {
      if (item.type === 'taskList') return indent(renderTaskList(item), LIST_INDENT);
      const done = item.attrs?.state === 'DONE';
      return `- [${done ? 'x' : ' '}] ${renderInline(item.content)}`;
    })
    .join('\n');
}

function cellText(cell: AdfNode): string {
  return renderBlocks(cell.content).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
}

function renderTable(node: AdfNode): string {
  const rows = (node.content ?? []).map((row) => (row.content ?? []).map(cellText));
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const [header, ...body] = rows;
  return [line(header), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join(
    '\n'
  );
}

function capitalise(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function renderBlock(node: AdfNode): string {
  switch (node.type) {
    case 'doc':
      return renderBlocks(node.content);
    case 'paragraph':
      return renderInline(node.content);
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${'#'.repeat(level)} ${renderInline(node.content)}`;
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(node);
    case 'taskList':
      return renderTaskList(node);
    case 'codeBlock':
      return `\`\`\`${str(node.attrs?.language)}\n${(node.content ?? []).map((n) => n.text ?? '').join('')}\n\`\`\``;
    case 'blockquote':
      return indent(renderBlocks(node.content), '> ');
    case 'panel': {
      const label = capitalise(str(node.attrs?.panelType) || 'note');
      const body = renderBlocks(node.content);
      return indent(`**${label}:** ${body}`, '> ');
    }
    case 'rule':
      return '---';
    case 'table':
      return renderTable(node);
    case 'expand':
    case 'nestedExpand': {
      const title = str(node.attrs?.title);
      const body = renderBlocks(node.content);
      return [title ? `**${title}**` : '', body].filter(Boolean).join(BLOCK_SEPARATOR);
    }
    case 'mediaSingle':
    case 'mediaGroup':
      return (node.content ?? [])
        .map((media) => `[attachment: ${str(media.attrs?.alt) || str(media.attrs?.id)}]`)
        .join('\n');
    case 'blockCard':
    case 'embedCard':
      return `<${str(node.attrs?.url)}>`;
    default:
      if (INLINE_TYPES.has(node.type)) return renderInlineNode(node);
      return renderBlocks(node.content);
  }
}

function renderBlocks(nodes: AdfNode[] | undefined): string {
  return (nodes ?? [])
    .map(renderBlock)
    .filter((block) => block !== '')
    .join(BLOCK_SEPARATOR);
}

/** Markdown for an ADF document; a string (Jira v2) passes through; nothing gives ''. */
export function adfToMarkdown(adf: unknown): string {
  if (adf === undefined || adf === null) return '';
  if (typeof adf === 'string') return adf;
  return renderBlock(adf as AdfNode).trim();
}

// ─── Markdown → ADF ──────────────────────────────────────────────────────────

const INLINE_TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const FENCE = /^```(\S*)\s*$/;
const QUOTE = /^>\s?(.*)$/;

function inlineNodes(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', text: text.slice(last, index) });
    if (match[1] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[1],
        marks: [{ type: 'link', attrs: { href: match[2] } }],
      });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3], marks: [{ type: 'strong' }] });
    } else {
      nodes.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

function paragraph(lines: string[]): AdfNode {
  const content: AdfNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: 'hardBreak' });
    content.push(...inlineNodes(line));
  });
  return { type: 'paragraph', content };
}

/** An ADF document for Markdown that shep writes. */
export function markdownToAdf(markdown: string): AdfNode & { version: number } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const content: AdfNode[] = [];
  let index = 0;

  const collect = (pattern: RegExp): string[] => {
    const items: string[] = [];
    while (index < lines.length) {
      const match = pattern.exec(lines[index]);
      if (!match) break;
      items.push(match[1]);
      index += 1;
    }
    return items;
  };
  const listOf = (type: string, items: string[]): AdfNode => ({
    type,
    content: items.map((item) => ({ type: 'listItem', content: [paragraph([item])] })),
  });

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index])) code.push(lines[index++]);
      index += 1;
      content.push({
        type: 'codeBlock',
        attrs: { language: fence[1] },
        content: code.length > 0 ? [{ type: 'text', text: code.join('\n') }] : [],
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: inlineNodes(heading[2]),
      });
      index += 1;
      continue;
    }
    if (BULLET.test(line)) {
      content.push(listOf('bulletList', collect(BULLET)));
      continue;
    }
    if (ORDERED.test(line)) {
      content.push(listOf('orderedList', collect(ORDERED)));
      continue;
    }
    if (QUOTE.test(line)) {
      content.push({ type: 'blockquote', content: [paragraph(collect(QUOTE))] });
      continue;
    }
    const block: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      ![FENCE, HEADING, BULLET, ORDERED, QUOTE].some((pattern) => pattern.test(lines[index]))
    ) {
      block.push(lines[index++]);
    }
    content.push(paragraph(block));
  }

  return { type: 'doc', version: 1, content };
}
