/**
 * Skill Injector Service Interface
 *
 * Output port for injecting curated agent skills into worktrees
 * during feature creation. Handles local skill copying, remote skill
 * installation via npx, and idempotency checks.
 *
 * Injected skills are worktree-local tooling: the injector never modifies
 * `.gitignore`, and commits exclude newly-added files under `.claude/skills/`
 * at staging time (see IGitCommitService).
 */

import type { SkillInjectionConfig } from '../../../../domain/generated/output.js';

export interface SkillInjectionResult {
  /** Names of skills that were successfully injected */
  injected: string[];
  /** Names of skills that were already present and skipped */
  skipped: string[];
  /** Skills that failed to inject, with error details */
  failed: { name: string; error: string }[];
}

export interface ISkillInjectorService {
  /**
   * Inject curated skills into a worktree's .claude/skills/ directory.
   *
   * For each skill in the config:
   * - Local skills are deep-copied from the source path
   * - Remote skills are installed via `npx skills add`
   * - Skills already present (SKILL.md exists) are skipped
   * - Injected skills are never added to `.gitignore`; they are excluded
   *   from commits at staging time instead
   *
   * Individual skill failures are captured in the result (not thrown).
   *
   * @param worktreePath - Absolute path to the worktree root
   * @param config - Skill injection configuration from settings
   * @param repoRoot - Absolute path to the main repository root (for resolving local skill sources)
   * @returns Counts of injected, skipped, and failed skills
   */
  inject(
    worktreePath: string,
    config: SkillInjectionConfig,
    repoRoot?: string
  ): Promise<SkillInjectionResult>;
}
