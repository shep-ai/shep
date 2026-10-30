/**
 * The editable surface of a learned harness (spec 150).
 *
 * A learned harness is stored in ONE agent-neutral layout, so an adopted
 * version keeps working when the user switches agents. Installers map this
 * layout onto each agent family's own paths (`HARNESS_INSTALL_SURFACES`).
 * Adapted from Harness² `SurfaceSpec` (google-research/harness2, Apache-2.0).
 *
 *   instructions.md                 always on — role and procedure
 *   guardrails.md                   always on — standing rules
 *   tool-guidance.md                always on — how to use the tools
 *   memory.md                       durable facts → Shep Brain on adoption
 *   skills/<name>/SKILL.md          on demand — a triggered workflow
 *   skills/<name>/scripts/<file>    a helper that travels with its skill
 *   scripts/<file>                  a deterministic helper
 *   subagents/<name>/AGENT.md       a delegated agent with its own context
 *   hooks/hooks.json                lifecycle hooks (Claude Code hook schema)
 */

// No .js extension: the web package consumes this subtree as raw TypeScript.
import {
  HarnessAlwaysOnChannel,
  HarnessComponentKind,
  HarnessSurfaceFamily,
} from '../generated/output';

export const INSTRUCTIONS_PATH = 'instructions.md';
export const GUARDRAILS_PATH = 'guardrails.md';
export const TOOL_GUIDANCE_PATH = 'tool-guidance.md';
export const MEMORY_PATH = 'memory.md';
export const HOOKS_PATH = 'hooks/hooks.json';

/** Always-on files, in the order their text is joined. */
export const ALWAYS_ON_PATHS: readonly string[] = [
  INSTRUCTIONS_PATH,
  GUARDRAILS_PATH,
  TOOL_GUIDANCE_PATH,
];

/** Prefix every installed skill, subagent and directory carries, so nothing collides with a repository's own files. */
export const INSTALLED_NAME_PREFIX = 'shep-learned-';

const NAME = '[a-z0-9][a-z0-9_-]*';
const SCRIPT_FILE = '[a-z0-9_][a-z0-9_.-]*\\.(?:py|sh|js|mjs|cjs|ts)';

export const SKILL_RE = new RegExp(`^skills/(${NAME})/SKILL\\.md$`);
export const SKILL_SCRIPT_RE = new RegExp(`^skills/(${NAME})/scripts/(${SCRIPT_FILE})$`);
export const SCRIPT_RE = new RegExp(`^scripts/(${SCRIPT_FILE})$`);
export const SUBAGENT_RE = new RegExp(`^subagents/(${NAME})/AGENT\\.md$`);

/** A script invocation inside prose: `python3 scripts/x.py`, `bash skills/a/scripts/b.sh`. */
export const SCRIPT_REFERENCE_RE =
  /(?:python3?|node|bash|sh|npx\s+tsx|tsx)\s+((?:skills\/[a-z0-9][a-z0-9_-]*\/)?scripts\/[\w.-]+)/g;

const ABSOLUTE_RE = /^(?:\/|[A-Za-z]:\/)/;

/** Normalise a harness-relative path; throws when it would escape the harness. */
export function normalizeHarnessPath(path: string): string {
  let p = String(path).trim().replace(/\\/g, '/');
  if (ABSOLUTE_RE.test(p) || p.split('/').includes('..')) {
    throw new Error(`path escapes the harness: ${path}`);
  }
  while (p.startsWith('./')) p = p.slice(2);
  return p.replace(/^\/+|\/+$/g, '');
}

/** The component kind of a canonical path, or undefined when it is off the surface. */
export function componentKindOf(path: string): HarnessComponentKind | undefined {
  let p: string;
  try {
    p = normalizeHarnessPath(path);
  } catch {
    return undefined;
  }
  if (p === INSTRUCTIONS_PATH) return HarnessComponentKind.Instructions;
  if (p === GUARDRAILS_PATH) return HarnessComponentKind.Guardrails;
  if (p === TOOL_GUIDANCE_PATH) return HarnessComponentKind.ToolGuidance;
  if (p === MEMORY_PATH) return HarnessComponentKind.Memory;
  if (p === HOOKS_PATH) return HarnessComponentKind.Hook;
  if (SKILL_RE.test(p)) return HarnessComponentKind.Skill;
  if (SKILL_SCRIPT_RE.test(p) || SCRIPT_RE.test(p)) return HarnessComponentKind.Script;
  if (SUBAGENT_RE.test(p)) return HarnessComponentKind.Subagent;
  return undefined;
}

export function isOnSurface(path: string): boolean {
  return componentKindOf(path) !== undefined;
}

/** Components that execute code in later runs; they always need a person to adopt them. */
export const EXECUTABLE_KINDS: ReadonlySet<HarnessComponentKind> = new Set([
  HarnessComponentKind.Script,
  HarnessComponentKind.Hook,
]);

/** Components whose text is in context on every run. */
export const ALWAYS_ON_KINDS: ReadonlySet<HarnessComponentKind> = new Set([
  HarnessComponentKind.Instructions,
  HarnessComponentKind.Guardrails,
  HarnessComponentKind.ToolGuidance,
]);

/** Where one agent family reads harness components from, as data. */
export interface HarnessInstallSurface {
  alwaysOn: HarnessAlwaysOnChannel;
  /** Directory the agent discovers skills in, or undefined when it has none (index in prompt). */
  skillsDir?: string;
  /** Directory the agent discovers subagents in, or undefined (index in prompt). */
  subagentsDir?: string;
  /** Whether hooks can be installed for this family. */
  hooks: boolean;
}

/** Shep-owned directory holding scripts and anything an agent reads by path. */
export const LEARNED_DIR = '.shep/learned';

export const HARNESS_INSTALL_SURFACES: Readonly<
  Record<HarnessSurfaceFamily, HarnessInstallSurface>
> = Object.freeze({
  [HarnessSurfaceFamily.ClaudeCode]: {
    alwaysOn: HarnessAlwaysOnChannel.SystemPrompt,
    skillsDir: '.claude/skills',
    subagentsDir: '.claude/agents',
    hooks: true,
  },
  [HarnessSurfaceFamily.Codex]: {
    alwaysOn: HarnessAlwaysOnChannel.Prompt,
    skillsDir: '.agents/skills',
    hooks: false,
  },
  [HarnessSurfaceFamily.PromptSection]: {
    alwaysOn: HarnessAlwaysOnChannel.Prompt,
    hooks: false,
  },
});
