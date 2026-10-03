/**
 * Discovers harness instructions from a repository (spec 119, docs/09).
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import yaml from 'js-yaml';
import type {
  DiscoveredInstruction,
  IInstructionSource,
  InstructionIssue,
} from '../../../../application/ports/output/harness/index.js';

/** Repository-relative directory for harness-specific instructions. */
export const REPO_INSTRUCTIONS_DIR = '.shep/harness/instructions';
const RULES_DIR = '.claude/rules';

const ROOT_FILES: { file: string; priority: number }[] = [
  { file: 'CLAUDE.md', priority: 100 },
  { file: 'AGENTS.md', priority: 90 },
];
const RULES_PRIORITY = 80;
const HARNESS_PRIORITY = 50;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

interface Frontmatter {
  id?: unknown;
  title?: unknown;
  priority?: unknown;
  pin?: unknown;
  enabled?: unknown;
  when?: unknown;
}

function slugify(path: string): string {
  return path
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

export class FileSystemInstructionSource implements IInstructionSource {
  async discover(repoRoot: string) {
    const instructions: DiscoveredInstruction[] = [];
    const issues: InstructionIssue[] = [];
    const candidates: { rel: string; priority: number }[] = [
      ...ROOT_FILES.map((r) => ({ rel: r.file, priority: r.priority })),
      ...(await listMarkdown(join(repoRoot, RULES_DIR))).map((f) => ({
        rel: `${RULES_DIR}/${f}`,
        priority: RULES_PRIORITY,
      })),
      ...(await listMarkdown(join(repoRoot, REPO_INSTRUCTIONS_DIR))).map((f) => ({
        rel: `${REPO_INSTRUCTIONS_DIR}/${f}`,
        priority: HARNESS_PRIORITY,
      })),
    ];
    for (const { rel, priority } of candidates) {
      let text: string;
      try {
        text = await readFile(join(repoRoot, rel), 'utf8');
      } catch {
        continue;
      }
      let front: Frontmatter = {};
      let body = text;
      const m = FRONTMATTER.exec(text);
      if (m) {
        try {
          const parsed = yaml.load(m[1]);
          if (parsed && typeof parsed === 'object') front = parsed as Frontmatter;
          body = text.slice(m[0].length);
        } catch (error) {
          issues.push({ file: rel, message: `invalid frontmatter: ${(error as Error).message}` });
          continue;
        }
      }
      const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
      instructions.push({
        id: typeof front.id === 'string' && front.id ? front.id : slugify(rel),
        title:
          typeof front.title === 'string' && front.title ? front.title : (heading ?? basename(rel)),
        source: rel,
        priority: typeof front.priority === 'number' ? front.priority : priority,
        pin: front.pin !== false,
        enabled: front.enabled !== false,
        ...(front.when !== undefined &&
          front.when !== null &&
          typeof front.when === 'object' && { condition: front.when as Record<string, unknown> }),
        body,
      });
    }
    instructions.sort((a, b) => b.priority - a.priority);
    return { instructions, issues };
  }
}
