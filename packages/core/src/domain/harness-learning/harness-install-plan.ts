/**
 * Where a learned harness goes for one agent family (spec 150) — a pure plan
 * the installer then writes.
 *
 * Every installed skill, subagent and directory is prefixed `shep-learned-` or
 * lives under `.shep/learned/`, so nothing collides with the repository's own
 * files, and every path is git-excluded. Canonical paths in the harness text
 * (`skills/<name>/scripts/x.py`, `scripts/x.sh`, skill names) are rewritten to
 * where they are actually installed, so the agent finds what the text names.
 * Memory is never installed as a file: on adoption it becomes Shep Brain
 * entries, which every prompt already carries.
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import { HarnessAlwaysOnChannel, type HarnessSurfaceFamily } from '../generated/output';
import { parseFrontmatter } from './frontmatter';
import {
  HARNESS_INSTALL_SURFACES,
  HOOKS_PATH,
  INSTALLED_NAME_PREFIX,
  LEARNED_DIR,
  SCRIPT_RE,
  SKILL_RE,
  SKILL_SCRIPT_RE,
  SUBAGENT_RE,
} from './harness-surfaces';
import { alwaysOnText, skillNames, subagentNames, type HarnessTree } from './harness-tree';

export interface HarnessInstallPlan {
  /** Worktree-relative path → content. */
  files: Record<string, string>;
  /** Text appended to the system prompt (system-prompt surfaces). */
  systemPrompt?: string;
  /** Section added to the task prompt (prompt surfaces). */
  promptSection?: string;
  /** Claude Code settings JSON carrying the hooks, when hooks are installed. */
  hooksSettings?: string;
  warnings: string[];
}

/** `.git/info/exclude` patterns covering everything an installer may write. */
export const INSTALL_EXCLUDE_PATTERNS: readonly string[] = [
  `/${LEARNED_DIR}/`,
  `/.claude/skills/${INSTALLED_NAME_PREFIX}*/`,
  `/.claude/agents/${INSTALLED_NAME_PREFIX}*.md`,
  `/.agents/skills/${INSTALLED_NAME_PREFIX}*/`,
];

export const LEARNED_SECTION_TITLE = 'Learned harness for this repository';

const LEARNED_SECTION_LEAD =
  'Shep learned these from earlier features in this repository. Follow them as standing guidance; the task in front of you still decides what to build.';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function skillDir(family: HarnessSurfaceFamily, name: string): string {
  const dir = HARNESS_INSTALL_SURFACES[family].skillsDir;
  return dir ? `${dir}/${INSTALLED_NAME_PREFIX}${name}` : `${LEARNED_DIR}/skills/${name}`;
}

function installedSkillName(family: HarnessSurfaceFamily, name: string): string {
  return HARNESS_INSTALL_SURFACES[family].skillsDir ? `${INSTALLED_NAME_PREFIX}${name}` : name;
}

function subagentPath(family: HarnessSurfaceFamily, name: string): string {
  const dir = HARNESS_INSTALL_SURFACES[family].subagentsDir;
  return dir
    ? `${dir}/${INSTALLED_NAME_PREFIX}${name}.md`
    : `${LEARNED_DIR}/subagents/${name}/AGENT.md`;
}

/** Rewrites canonical references to installed ones in any harness text. */
function makeRewriter(tree: HarnessTree, family: HarnessSurfaceFamily): (text: string) => string {
  const skills = skillNames(tree);
  return (text) => {
    let out = text;
    for (const name of skills) {
      out = out.replace(
        new RegExp(`(?<![\\w/.-])skills/${escapeRe(name)}/scripts/`, 'g'),
        `${skillDir(family, name)}/scripts/`
      );
    }
    out = out.replace(/(?<![\w/.-])scripts\//g, `${LEARNED_DIR}/scripts/`);
    for (const name of skills) {
      const installed = installedSkillName(family, name);
      if (installed !== name) {
        out = out.replace(new RegExp(`\`${escapeRe(name)}\``, 'g'), `\`${installed}\``);
      }
    }
    return out;
  };
}

function renameFrontmatter(content: string, name: string): string {
  return /^---\r?\n[\s\S]*?^name:/m.test(content)
    ? content.replace(/^name:.*$/m, `name: ${name}`)
    : content.replace(/^---\r?\n/, `---\nname: ${name}\n`);
}

function indexLines(tree: HarnessTree, family: HarnessSurfaceFamily): string[] {
  const surface = HARNESS_INSTALL_SURFACES[family];
  const lines: string[] = [];
  if (!surface.skillsDir) {
    for (const name of skillNames(tree)) {
      const description = parseFrontmatter(tree[`skills/${name}/SKILL.md`])?.description ?? '';
      lines.push(
        `- Skill \`${name}\`: ${description} — read ${skillDir(family, name)}/SKILL.md and follow it when this applies.`
      );
    }
  }
  if (!surface.subagentsDir) {
    for (const name of subagentNames(tree)) {
      const description = parseFrontmatter(tree[`subagents/${name}/AGENT.md`])?.description ?? '';
      lines.push(
        `- Delegation \`${name}\`: ${description} — the procedure is in ${subagentPath(family, name)}.`
      );
    }
  }
  return lines;
}

export function planHarnessInstall(
  tree: HarnessTree,
  family: HarnessSurfaceFamily
): HarnessInstallPlan {
  const surface = HARNESS_INSTALL_SURFACES[family];
  const rewrite = makeRewriter(tree, family);
  const files: Record<string, string> = {};
  const warnings: string[] = [];

  for (const [path, content] of Object.entries(tree)) {
    let m: RegExpExecArray | null;
    if ((m = SKILL_RE.exec(path))) {
      const body = rewrite(content);
      files[`${skillDir(family, m[1])}/SKILL.md`] = surface.skillsDir
        ? renameFrontmatter(body, installedSkillName(family, m[1]))
        : body;
    } else if ((m = SKILL_SCRIPT_RE.exec(path))) {
      files[`${skillDir(family, m[1])}/scripts/${m[2]}`] = content;
    } else if ((m = SCRIPT_RE.exec(path))) {
      files[`${LEARNED_DIR}/scripts/${m[1]}`] = content;
    } else if ((m = SUBAGENT_RE.exec(path))) {
      const body = rewrite(content);
      files[subagentPath(family, m[1])] = surface.subagentsDir
        ? renameFrontmatter(body, `${INSTALLED_NAME_PREFIX}${m[1]}`)
        : body;
    }
  }

  let hooksSettings: string | undefined;
  if (tree[HOOKS_PATH] !== undefined) {
    if (surface.hooks) hooksSettings = rewrite(tree[HOOKS_PATH]);
    else warnings.push(`hooks are not installed for this agent (${family})`);
  }

  const alwaysOn = rewrite(alwaysOnText(tree));
  const index = indexLines(tree, family);
  const plan: HarnessInstallPlan = { files, warnings, ...(hooksSettings && { hooksSettings }) };
  if (!alwaysOn && index.length === 0) return plan;

  const body = [alwaysOn, ...(index.length ? [index.join('\n')] : [])].filter(Boolean).join('\n\n');
  const section = `## ${LEARNED_SECTION_TITLE}\n\n${LEARNED_SECTION_LEAD}\n\n${body}`;
  if (surface.alwaysOn === HarnessAlwaysOnChannel.SystemPrompt) plan.systemPrompt = section;
  else plan.promptSection = section;
  return plan;
}
