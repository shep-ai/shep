/**
 * Prompt sections (spec 119, task-25).
 *
 * The harness turns a node's prompt into addressable chunks. V0 derives
 * sections from the rendered prompt's Markdown structure, so every existing
 * prompt builder (and every CLI agent) keeps its exact string: rendering the
 * sections always reproduces the input byte-for-byte.
 */

/** Section kinds the context engine treats differently. */
export const PromptSectionKind = {
  /** Instructions telling the agent what to do; always shown. */
  Instructions: 'instructions',
  /** Inlined reference material (spec YAML, feedback history, memory). */
  Reference: 'reference',
} as const;
export type PromptSectionKind = (typeof PromptSectionKind)[keyof typeof PromptSectionKind];

export interface PromptSection {
  id: string;
  title: string;
  kind: PromptSectionKind;
  /** Exact text of the section, including its heading line. */
  content: string;
  /** Instruction sections are pinned: never hidden or downgraded. */
  pinned: boolean;
  /** Repository-relative file the section inlines, when detectable. */
  sourcePath?: string;
}

const HEADING = /^(#{1,3}) +(.+?)\s*$/;
const FENCE = /^(```|~~~)/;
const REFERENCE_TITLE =
  /\b(spec|research|plan|tasks|feedback|memory|context|history|artifact|yaml|requirements|reference|existing|previous|evidence)\b/i;
const YAML_FILE = /\b([\w./-]+\.ya?ml)\b/;

function slug(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/** Split a rendered prompt at top-level Markdown headings (outside code fences). */
export function splitPromptIntoSections(prompt: string): PromptSection[] {
  const lines = prompt.split('\n');
  const starts: { line: number; title: string }[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line.trim())) inFence = !inFence;
    const m = !inFence && HEADING.exec(line);
    if (m && m[1].length <= 2) starts.push({ line: i, title: m[2] });
  });
  const used = new Set<string>();
  const sections: PromptSection[] = [];
  const pushSection = (from: number, to: number, title: string) => {
    const content = lines.slice(from, to).join('\n') + (to < lines.length ? '\n' : '');
    if (content.length === 0) return;
    const yamlFile = YAML_FILE.exec(title) ?? YAML_FILE.exec(content.slice(0, 400));
    const reference = REFERENCE_TITLE.test(title) && content.length > 600;
    sections.push({
      id: slug(title, used),
      title,
      kind: reference ? PromptSectionKind.Reference : PromptSectionKind.Instructions,
      content,
      pinned: !reference,
      ...(reference && yamlFile && { sourcePath: yamlFile[1] }),
    });
  };
  const first = starts[0]?.line ?? lines.length;
  if (first > 0) pushSection(0, first, 'Task');
  starts.forEach((s, i) => pushSection(s.line, starts[i + 1]?.line ?? lines.length, s.title));
  return sections;
}

/** Inverse of splitPromptIntoSections: the exact original prompt. */
export function renderPromptSections(sections: readonly PromptSection[]): string {
  return sections.map((s) => s.content).join('');
}
