/**
 * Validation of a proposed learned harness (spec 150).
 *
 * Returns every problem as actionable prose, because the messages are fed back
 * verbatim to the improver as retry feedback. A harness that fails validation
 * is never installed. Rules adapted from Harness² `core/tree.py` validation and
 * the surface prompts (google-research/harness2, Apache-2.0).
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  ALWAYS_ON_PATHS,
  HOOKS_PATH,
  SCRIPT_REFERENCE_RE,
  SKILL_RE,
  SUBAGENT_RE,
  isOnSurface,
  normalizeHarnessPath,
} from './harness-surfaces';
import { alwaysOnText, skillNames, type HarnessTree } from './harness-tree';
import { parseFrontmatter } from './frontmatter';

/** Largest single component, in characters. */
export const MAX_HARNESS_FILE_CHARS = 20_000;

/** Most files a harness may hold. */
export const MAX_HARNESS_FILES = 40;

/** Hook events Shep installs (Claude Code hook schema). */
export const HOOK_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'Stop',
]);

export interface HarnessValidationOptions {
  alwaysOnCharCap: number;
}

const TEMPLATE_BRACES_RE = /\{\{|\{%/;

export function validateHarnessTree(
  tree: HarnessTree,
  options: HarnessValidationOptions
): string[] {
  const problems: string[] = [];
  const paths = Object.keys(tree);

  if (paths.length > MAX_HARNESS_FILES) {
    problems.push(
      `the harness has ${paths.length} files; it may hold at most ${MAX_HARNESS_FILES} files. Merge or drop components.`
    );
  }

  for (const path of paths) {
    try {
      normalizeHarnessPath(path);
    } catch {
      problems.push(`${path} escapes the harness directory; keep every file inside it.`);
      continue;
    }
    if (!isOnSurface(path)) {
      problems.push(
        `${path} is not on the editable surface and would be discarded. Names are lowercase letters, digits, \`_\` or \`-\` (e.g. \`skills/doc-review/SKILL.md\`, \`scripts/check_totals.py\`, \`skills/doc-review/scripts/check.py\`).`
      );
    }
    if (tree[path].length > MAX_HARNESS_FILE_CHARS) {
      problems.push(
        `${path} is ${tree[path].length} characters; a component may hold at most ${MAX_HARNESS_FILE_CHARS}. Split it or move detail into a skill.`
      );
    }
  }

  checkAlwaysOn(tree, options.alwaysOnCharCap, problems);
  checkSkills(tree, problems);
  checkSubagents(tree, problems);
  checkScriptReferences(tree, problems);
  checkHooks(tree, problems);
  return problems;
}

function checkAlwaysOn(tree: HarnessTree, cap: number, problems: string[]): void {
  for (const path of ALWAYS_ON_PATHS) {
    if (TEMPLATE_BRACES_RE.test(tree[path] ?? '')) {
      problems.push(
        `${path} contains template braces (\`{{\` or \`{%\`); use a single brace or words.`
      );
    }
  }
  const length = alwaysOnText(tree).length;
  if (length > cap) {
    problems.push(
      `always-on text is ${length} characters; the cap is ${cap}. It is paid for on every run — move procedure into a skill or cut something to pay for what you added.`
    );
  }
}

function checkSkills(tree: HarnessTree, problems: string[]): void {
  const alwaysOn = alwaysOnText(tree);
  for (const name of skillNames(tree)) {
    const path = `skills/${name}/SKILL.md`;
    const fm = parseFrontmatter(tree[path]);
    if (!fm) {
      problems.push(
        `${path} has no YAML frontmatter; start it with ---, \`name: ${name}\`, \`description: <when to use it>\`, ---.`
      );
    } else {
      if (fm.name !== undefined && fm.name !== name) {
        problems.push(`${path} name: must match its directory \`${name}\` (found \`${fm.name}\`).`);
      }
      if (!fm.description) {
        problems.push(`${path} frontmatter needs a \`description:\` saying when to use the skill.`);
      }
    }
    if (!alwaysOn.includes(`\`${name}\``) && !alwaysOn.includes(name)) {
      problems.push(
        `skill \`${name}\` is not named in always-on text, so no agent would ever open it. Add a line to instructions.md: When <situation>, load the \`${name}\` skill.`
      );
    }
  }
  for (const path of Object.keys(tree)) {
    if (path.startsWith('skills/') && path.endsWith('SKILL.md') && !SKILL_RE.test(path)) {
      problems.push(`${path} is not at skills/<name>/SKILL.md.`);
    }
  }
}

function checkSubagents(tree: HarnessTree, problems: string[]): void {
  for (const path of Object.keys(tree)) {
    if (!SUBAGENT_RE.test(path)) continue;
    const fm = parseFrontmatter(tree[path]);
    if (!fm?.description) {
      problems.push(
        `${path} needs YAML frontmatter with a \`description:\` saying what bounded task it takes.`
      );
    }
  }
}

function checkScriptReferences(tree: HarnessTree, problems: string[]): void {
  const reported = new Set<string>();
  for (const [path, content] of Object.entries(tree)) {
    for (const match of content.matchAll(SCRIPT_REFERENCE_RE)) {
      const ref = match[1];
      if (ref in tree || reported.has(ref)) continue;
      reported.add(ref);
      problems.push(
        `${path} invokes ${ref}, which does not exist in the harness. Ship it in the same proposal (a skill's helper goes in skills/<skill>/scripts/).`
      );
    }
  }
}

function checkHooks(tree: HarnessTree, problems: string[]): void {
  const raw = tree[HOOKS_PATH];
  if (raw === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    problems.push(`${HOOKS_PATH} is not valid JSON.`);
    return;
  }
  const hooks = (parsed as { hooks?: unknown })?.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    problems.push(`${HOOKS_PATH} needs a top-level "hooks" object mapping events to matchers.`);
    return;
  }
  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!HOOK_EVENTS.has(event)) {
      problems.push(
        `${HOOKS_PATH} has unknown event \`${event}\`; use one of ${[...HOOK_EVENTS].join(', ')}.`
      );
      continue;
    }
    if (!Array.isArray(entries)) {
      problems.push(`${HOOKS_PATH} ${event} must be a list of matcher entries.`);
      continue;
    }
    entries.forEach((entry, i) => {
      const list = (entry as { hooks?: unknown })?.hooks;
      if (!Array.isArray(list) || list.length === 0) {
        problems.push(`${HOOKS_PATH} ${event}[${i}] needs a non-empty "hooks" list.`);
        return;
      }
      list.forEach((hook, j) => {
        const h = hook as { type?: unknown; command?: unknown };
        if (h?.type !== 'command' || typeof h.command !== 'string' || !h.command.trim()) {
          problems.push(
            `${HOOKS_PATH} ${event}[${i}].hooks[${j}] must be {"type": "command", "command": "<shell command>"}.`
          );
        }
      });
    });
  }
}
