/**
 * Instruction discovery (spec 119, docs/09).
 *
 * Sources, in priority order: CLAUDE.md, AGENTS.md, .claude/rules/*.md and
 * .shep/harness/instructions/*.md. Optional YAML frontmatter sets id, title,
 * priority, pin, enabled and a `when` condition.
 */

export interface DiscoveredInstruction {
  id: string;
  title: string;
  /** Repository-relative path. */
  source: string;
  priority: number;
  pin: boolean;
  enabled: boolean;
  condition?: Record<string, unknown>;
  body: string;
}

export interface InstructionIssue {
  file: string;
  message: string;
}

export interface IInstructionSource {
  discover(
    repoRoot: string
  ): Promise<{ instructions: DiscoveredInstruction[]; issues: InstructionIssue[] }>;
}
