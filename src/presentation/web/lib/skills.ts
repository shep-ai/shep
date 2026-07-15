import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';

// ── Types ────────────────────────────────────────────────────────────────────

export type SkillCategory = 'Workflow' | 'Code Generation' | 'Analysis' | 'Reference';
export type SkillSource = 'project' | 'global';

export interface SkillResource {
  name: string;
  fileCount: number;
}

export interface SkillData {
  name: string;
  displayName: string;
  description: string;
  context?: string;
  allowedTools?: string;
  category: SkillCategory;
  source: SkillSource;
  body: string;
  resources: SkillResource[];
}

// ── Category Derivation ──────────────────────────────────────────────────────

const CATEGORY_RULES: { test: (name: string) => boolean; category: SkillCategory }[] = [
  { test: (name) => name.startsWith('shep-kit:'), category: 'Workflow' },
  { test: (name) => name.startsWith('shep:'), category: 'Code Generation' },
  { test: (name) => /(?:review|validate|cross-validate)/.test(name), category: 'Analysis' },
];

export function deriveCategory(name: string): SkillCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.test(name)) return rule.category;
  }
  return 'Reference';
}

// ── Display Name ─────────────────────────────────────────────────────────────

const DISPLAY_NAME_PREFIXES = ['shep-kit:', 'shep:'];

export function getDisplayName(name: string): string {
  for (const prefix of DISPLAY_NAME_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

// ── Frontmatter Parsing ─────────────────────────────────────────────────────

interface FrontmatterResult {
  name: string;
  description: string;
  context?: string;
  allowedTools?: string;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult | null {
  const delimiterPattern = /^---\s*$/m;
  const firstMatch = content.match(delimiterPattern);
  if (firstMatch?.index === undefined) return null;

  const afterFirst = firstMatch.index + firstMatch[0].length;
  const rest = content.slice(afterFirst);
  const secondMatch = rest.match(delimiterPattern);
  if (secondMatch?.index === undefined) return null;

  const yamlContent = rest.slice(0, secondMatch.index);
  const body = rest.slice(secondMatch.index + secondMatch[0].length).trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.load(yamlContent) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const name = parsed['name'];
  const description = parsed['description'];
  if (typeof name !== 'string' || typeof description !== 'string') return null;

  return {
    name,
    description,
    context: typeof parsed['context'] === 'string' ? parsed['context'] : undefined,
    allowedTools: typeof parsed['allowed-tools'] === 'string' ? parsed['allowed-tools'] : undefined,
    body,
  };
}

// ── Resource Detection ───────────────────────────────────────────────────────

const KNOWN_RESOURCE_DIRS = [
  'references',
  'examples',
  'templates',
  'scripts',
  'validation',
  'rules',
];

async function detectResources(skillDir: string): Promise<SkillResource[]> {
  const resources: SkillResource[] = [];
  for (const dirName of KNOWN_RESOURCE_DIRS) {
    try {
      const entries = await readdir(join(skillDir, dirName));
      resources.push({ name: dirName, fileCount: entries.length });
    } catch {
      // Directory doesn't exist — skip
    }
  }
  return resources;
}

// ── Skill Directory Reader ───────────────────────────────────────────────────

async function getSkillsFromDirectory(dirPath: string, source: SkillSource): Promise<SkillData[]> {
  let entries: string[];
  try {
    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const skills: SkillData[] = [];
  for (const entry of entries) {
    const skillDir = join(dirPath, entry);
    const skillMdPath = join(skillDir, 'SKILL.md');

    let content: string;
    try {
      content = await readFile(skillMdPath, 'utf-8');
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping skill "${entry}": invalid or missing frontmatter in SKILL.md`);
      continue;
    }

    const resources = await detectResources(skillDir);

    skills.push({
      name: frontmatter.name,
      displayName: getDisplayName(frontmatter.name),
      description: frontmatter.description,
      context: frontmatter.context,
      allowedTools: frontmatter.allowedTools,
      category: deriveCategory(frontmatter.name),
      source,
      body: frontmatter.body,
      resources,
    });
  }

  return skills;
}

export async function getSkills(projectRoot?: string, homeDir?: string): Promise<SkillData[]> {
  const root = projectRoot ?? process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH ?? process.cwd();
  const home = homeDir ?? homedir();

  const projectDir = join(root, '.claude', 'skills');
  const globalDir = join(home, '.claude', 'skills');

  const [projectSkills, globalSkills] = await Promise.all([
    getSkillsFromDirectory(projectDir, 'project'),
    getSkillsFromDirectory(globalDir, 'global'),
  ]);

  // Deduplicate by name — project skills take precedence over global skills,
  // and the first of any colliding global skills wins. Two distinct directories
  // can advertise the same frontmatter `name`; the list must expose each name
  // once so name-keyed React renders stay unique.
  const seen = new Set(projectSkills.map((s) => s.name));
  const uniqueGlobalSkills: SkillData[] = [];
  for (const skill of globalSkills) {
    if (seen.has(skill.name)) continue;
    seen.add(skill.name);
    uniqueGlobalSkills.push(skill);
  }

  return [...projectSkills, ...uniqueGlobalSkills].sort((a, b) => a.name.localeCompare(b.name));
}
