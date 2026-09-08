/**
 * Skill Injector Service Implementation
 *
 * Injects curated agent skills into worktrees during feature creation.
 * Handles local skill copying via fs.cp, remote skill installation via npx,
 * and SKILL.md idempotency checks.
 *
 * Injected skills are worktree-local tooling: the injector never writes to
 * the (tracked) .gitignore, and commits exclude newly-added files under
 * `.claude/skills/` at staging time (see GitCommitService).
 *
 * Uses constructor-injected ExecFunction for process execution (npx, git)
 * and direct fs/promises imports for filesystem operations, following
 * the established codebase conventions.
 */

import { access, cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { injectable, inject } from 'tsyringe';

import type { SkillInjectionConfig, SkillSource } from '../../domain/generated/output.js';
import { SkillSourceType } from '../../domain/generated/output.js';
import type {
  ISkillInjectorService,
  SkillInjectionResult,
} from '../../application/ports/output/services/skill-injector.interface.js';
import type { ExecFunction } from './git/worktree.service.js';

const SKILLS_DIR = '.claude/skills';
const SKILL_MARKER = 'SKILL.md';
const REMOTE_SKILL_TIMEOUT_MS = 30_000;

/** Shell metacharacters that must not appear in skill source strings */
const SHELL_METACHAR_PATTERN = /[;|&$`\\(){}< >]/;

/** Patterns that indicate path traversal in skill names */
const PATH_TRAVERSAL_PATTERN = /\.\./;

@injectable()
export class SkillInjectorService implements ISkillInjectorService {
  constructor(@inject('ExecFunction') private readonly execFile: ExecFunction) {}

  async inject(
    worktreePath: string,
    config: SkillInjectionConfig,
    repoRoot?: string
  ): Promise<SkillInjectionResult> {
    // Validate worktree path exists
    await access(worktreePath);

    const result: SkillInjectionResult = {
      injected: [],
      skipped: [],
      failed: [],
    };

    if (!config.skills.length) {
      return result;
    }

    // Bootstrap .claude/skills/ directory
    const skillsDir = join(worktreePath, SKILLS_DIR);
    await mkdir(skillsDir, { recursive: true });

    // Process each skill
    for (const skill of config.skills) {
      // Validate skill name and source
      const validationError = this.validateSkill(skill);
      if (validationError) {
        result.failed.push({ name: skill.name, error: validationError });
        continue;
      }

      // Idempotency check: skip if SKILL.md already exists
      if (await this.isSkillPresent(worktreePath, skill.name)) {
        result.skipped.push(skill.name);
        continue;
      }

      // Inject based on type
      if (skill.type === SkillSourceType.Local) {
        await this.injectLocalSkill(worktreePath, skill, repoRoot, result);
      } else {
        await this.injectRemoteSkill(worktreePath, skill, result);
      }
    }

    return result;
  }

  private validateSkill(skill: SkillSource): string | undefined {
    // Validate skill name
    if (PATH_TRAVERSAL_PATTERN.test(skill.name)) {
      return `invalid skill name '${skill.name}': contains path traversal`;
    }
    if (skill.name.startsWith('/')) {
      return `invalid skill name '${skill.name}': absolute path not allowed`;
    }
    if (skill.name.includes('\\')) {
      return `invalid skill name '${skill.name}': backslash not allowed`;
    }

    // Validate source for remote skills (shell injection prevention)
    if (skill.type === SkillSourceType.Remote && SHELL_METACHAR_PATTERN.test(skill.source)) {
      return `invalid source '${skill.source}': contains shell metacharacters`;
    }

    return undefined;
  }

  private async isSkillPresent(worktreePath: string, skillName: string): Promise<boolean> {
    try {
      await access(join(worktreePath, SKILLS_DIR, skillName, SKILL_MARKER));
      return true;
    } catch {
      return false;
    }
  }

  private async injectLocalSkill(
    worktreePath: string,
    skill: SkillSource,
    repoRoot: string | undefined,
    result: SkillInjectionResult
  ): Promise<void> {
    const sourcePath = repoRoot ? join(repoRoot, skill.source) : skill.source;
    const destPath = join(worktreePath, SKILLS_DIR, skill.name);

    try {
      await cp(sourcePath, destPath, { recursive: true });
      result.injected.push(skill.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ name: skill.name, error: message });
    }
  }

  private async injectRemoteSkill(
    worktreePath: string,
    skill: SkillSource,
    result: SkillInjectionResult
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REMOTE_SKILL_TIMEOUT_MS);

    try {
      const args = ['skills', 'add', skill.source, '--yes'];
      if (skill.remoteSkillName) {
        args.push('--skill', skill.remoteSkillName);
      }

      await this.execFile('npx', args, {
        cwd: worktreePath,
        signal: controller.signal,
      });

      result.injected.push(skill.name);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const message = isTimeout
        ? `timeout: remote skill installation exceeded ${REMOTE_SKILL_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : String(error);
      result.failed.push({ name: skill.name, error: message });
    } finally {
      clearTimeout(timer);
    }
  }
}
