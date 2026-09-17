/**
 * SkillInjectorService Unit Tests
 *
 * Tests for the skill injection infrastructure service.
 * Uses constructor-injected ExecFunction mock and vi.mock for node:fs/promises.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.mock factory requires runtime import()
  const actual = (await importOriginal()) as typeof import('node:fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    cp: vi.fn().mockResolvedValue(undefined),
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
});

import { mkdir, cp, access, readFile, writeFile } from 'node:fs/promises';
import { SkillInjectorService } from '@/infrastructure/services/skill-injector.service.js';
import { SkillSourceType } from '@/domain/generated/output.js';
import type { SkillInjectionConfig } from '@/domain/generated/output.js';

type ExecFileFn = (
  cmd: string,
  args: string[],
  options?: object
) => Promise<{ stdout: string; stderr: string }>;

const mockMkdir = vi.mocked(mkdir);
const mockCp = vi.mocked(cp);
const mockAccess = vi.mocked(access);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

describe('SkillInjectorService', () => {
  let service: SkillInjectorService;
  let mockExecFile: ReturnType<typeof vi.fn<ExecFileFn>>;
  const worktreePath = '/worktree/project';
  const repoRoot = '/repo/root';

  beforeEach(() => {
    vi.resetAllMocks();
    mockExecFile = vi.fn<ExecFileFn>();
    service = new SkillInjectorService(mockExecFile);

    // Default: fs operations succeed
    mockMkdir.mockResolvedValue(undefined);
    mockCp.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    // Default: worktree path exists (access succeeds)
    mockAccess.mockResolvedValue(undefined);
  });

  // --- Task 4: Local skill injection ---

  describe('local skill injection', () => {
    it('should deep-copy a local skill to worktree .claude/skills/<name>/', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'architecture-reviewer',
            type: SkillSourceType.Local,
            source: '.claude/skills/architecture-reviewer',
          },
        ],
      };

      // SKILL.md does not exist (skill not present)
      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      // git ls-files: skill is not tracked
      mockExecFile.mockRejectedValue(new Error('not tracked'));

      // .gitignore does not exist
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(mockCp).toHaveBeenCalledWith(
        expect.stringMatching(/architecture-reviewer/),
        expect.stringMatching(/\.claude[/\\]skills[/\\]architecture-reviewer/),
        { recursive: true }
      );
      expect(result.injected).toContain('architecture-reviewer');
    });

    it('should create .claude/skills/ directory if missing', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'test-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/test-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await service.inject(worktreePath, config, repoRoot);

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringMatching(/\.claude[/\\]skills$/), {
        recursive: true,
      });
    });

    it('should resolve source paths against repo root, not worktree', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'mermaid-diagrams',
            type: SkillSourceType.Local,
            source: '.claude/skills/mermaid-diagrams',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await service.inject(worktreePath, config, repoRoot);

      // Source should be resolved against repoRoot
      const cpCall = mockCp.mock.calls[0];
      expect(cpCall[0]).toMatch(/^[/\\]repo[/\\]root/);
      // Destination should be in worktree
      expect(cpCall[1]).toMatch(/^[/\\]worktree[/\\]project/);
    });

    it('should add failed skill to result.failed when fs.cp throws', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'broken-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/broken-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      mockCp.mockRejectedValue(new Error('ENOENT: source not found'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('broken-skill');
      expect(result.failed[0].error).toContain('ENOENT');
      expect(result.injected).not.toContain('broken-skill');
    });

    it('should return empty result for empty skills array', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [],
      };

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.injected).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  // --- Task 5: SKILL.md idempotency check ---

  describe('idempotency check', () => {
    it('should skip skill when SKILL.md exists in target directory', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'existing-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/existing-skill',
          },
        ],
      };

      // SKILL.md exists — access succeeds
      mockAccess.mockResolvedValue(undefined);

      // git ls-files: tracked
      mockExecFile.mockResolvedValue({
        stdout: '.claude/skills/existing-skill/SKILL.md',
        stderr: '',
      });
      mockReadFile.mockResolvedValue('');

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.skipped).toContain('existing-skill');
      expect(result.injected).not.toContain('existing-skill');
      expect(mockCp).not.toHaveBeenCalled();
    });

    it('should produce identical results when inject() is called twice', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'skill-a',
            type: SkillSourceType.Local,
            source: '.claude/skills/skill-a',
          },
        ],
      };

      let callCount = 0;

      // First call: SKILL.md does not exist; Second call: SKILL.md exists
      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) {
          callCount++;
          if (callCount <= 1) throw new Error('ENOENT');
          // Second call: SKILL.md exists, return success
          return;
        }
      });
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result1 = await service.inject(worktreePath, config, repoRoot);
      expect(result1.injected).toContain('skill-a');

      // Reset readFile for second call
      mockReadFile.mockResolvedValue('');
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

      const result2 = await service.inject(worktreePath, config, repoRoot);
      expect(result2.skipped).toContain('skill-a');
      expect(result2.injected).not.toContain('skill-a');
    });
  });

  // --- Task 6: Remote skill injection ---

  describe('remote skill injection', () => {
    it('should call ExecFunction with correct npx arguments for remote skill', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'frontend-design',
            type: SkillSourceType.Remote,
            source: '@anthropic/skills',
            remoteSkillName: 'frontend-design',
          },
        ],
      };

      // SKILL.md does not exist
      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      // npx call succeeds
      mockExecFile.mockImplementation(async (cmd: string) => {
        if (cmd === 'npx') return { stdout: 'installed', stderr: '' };
        throw new Error('not tracked');
      });
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(mockExecFile).toHaveBeenCalledWith(
        'npx',
        ['skills', 'add', '@anthropic/skills', '--yes', '--skill', 'frontend-design'],
        expect.objectContaining({ cwd: worktreePath })
      );
      expect(result.injected).toContain('frontend-design');
    });

    it('should add remote skill to failed array when execution throws', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'bad-remote-skill',
            type: SkillSourceType.Remote,
            source: 'bad-package',
            remoteSkillName: 'bad-remote-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      mockExecFile.mockRejectedValue(new Error('npm ERR! 404 Not Found'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('bad-remote-skill');
      expect(result.failed[0].error).toContain('404');
    });

    it('should add remote skill to failed array on timeout (AbortError)', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'slow-skill',
            type: SkillSourceType.Remote,
            source: 'slow-package',
            remoteSkillName: 'slow-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockExecFile.mockRejectedValue(abortError);

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('slow-skill');
      expect(result.failed[0].error).toContain('timeout');
    });
  });

  // --- Task 7: .gitignore non-interference ---

  // Injected skills are worktree-local tooling. The injector must NEVER write
  // to the (tracked) .gitignore: any write there produces an uncommitted diff
  // that later leaks into the Merge Review commit via `git add -A`.
  // Skills are kept out of commits at staging time instead (GitCommitService).
  describe('.gitignore non-interference', () => {
    it('should NOT modify .gitignore when injecting an untracked skill', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'new-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/new-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      // git ls-files: untracked — the exact case the old code wrote entries for
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      // .gitignore exists with unrelated content
      mockReadFile.mockResolvedValue('node_modules/\n');

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.injected).toContain('new-skill');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should NOT modify .gitignore for tracked skills', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'tracked-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/tracked-skill',
          },
        ],
      };

      // SKILL.md does not exist (new skill)
      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      // git ls-files: tracked
      mockExecFile.mockResolvedValue({
        stdout: '.claude/skills/tracked-skill/SKILL.md',
        stderr: '',
      });
      mockReadFile.mockResolvedValue('');

      await service.inject(worktreePath, config, repoRoot);

      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should NOT create .gitignore when absent', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'fresh-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/fresh-skill',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.injected).toContain('fresh-skill');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should NOT modify .gitignore when all skills are already present (skipped)', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'existing-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/existing-skill',
          },
        ],
      };

      // SKILL.md exists — access succeeds
      mockAccess.mockResolvedValue(undefined);
      // git ls-files: untracked — old code wrote entries even for skipped skills
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockResolvedValue('');

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.skipped).toContain('existing-skill');
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  // --- Task 8: Input validation and security checks ---

  describe('input validation', () => {
    it('should reject source with shell metacharacters (semicolon)', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'evil-skill',
            type: SkillSourceType.Remote,
            source: 'package; rm -rf /',
            remoteSkillName: 'evil',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('evil-skill');
      expect(result.failed[0].error).toContain('invalid');
      expect(mockExecFile).not.toHaveBeenCalledWith('npx', expect.anything(), expect.anything());
    });

    it('should reject skill name with path traversal (..)', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: '../../../etc/passwd',
            type: SkillSourceType.Local,
            source: '.claude/skills/legit',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('invalid');
      expect(mockCp).not.toHaveBeenCalled();
    });

    it('should reject skill name starting with /', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: '/absolute/path',
            type: SkillSourceType.Local,
            source: '.claude/skills/test',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('invalid');
    });

    it('should throw for non-existent worktree path', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'test-skill',
            type: SkillSourceType.Local,
            source: '.claude/skills/test-skill',
          },
        ],
      };

      // worktree path does not exist (first access call fails)
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      await expect(service.inject('/nonexistent/path', config, repoRoot)).rejects.toThrow();
    });

    it('should reject source with pipe character', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'piped-skill',
            type: SkillSourceType.Remote,
            source: 'package | cat /etc/passwd',
            remoteSkillName: 'piped',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('invalid');
    });

    it('should reject skill name with backslash', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'skill\\path',
            type: SkillSourceType.Local,
            source: '.claude/skills/test',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
      });

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('invalid');
    });
  });

  // --- Multiple skills ---

  describe('multiple skills', () => {
    it('should process multiple skills and aggregate results', async () => {
      const config: SkillInjectionConfig = {
        enabled: true,
        skills: [
          {
            name: 'skill-present',
            type: SkillSourceType.Local,
            source: '.claude/skills/skill-present',
          },
          {
            name: 'skill-new',
            type: SkillSourceType.Local,
            source: '.claude/skills/skill-new',
          },
          {
            name: 'skill-broken',
            type: SkillSourceType.Local,
            source: '.claude/skills/skill-broken',
          },
        ],
      };

      mockAccess.mockImplementation(async (p) => {
        const path = String(p);
        // skill-present has SKILL.md
        if (path.includes('skill-present') && path.includes('SKILL.md')) return;
        // Others don't
        if (path.includes('SKILL.md')) throw new Error('ENOENT');
        // Worktree path exists
      });

      // fs.cp: skill-broken fails
      mockCp.mockImplementation(async (_src, dest) => {
        const d = String(dest);
        if (d.includes('skill-broken')) throw new Error('copy failed');
      });

      // git ls-files: not tracked
      mockExecFile.mockRejectedValue(new Error('not tracked'));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      const result = await service.inject(worktreePath, config, repoRoot);

      expect(result.skipped).toContain('skill-present');
      expect(result.injected).toContain('skill-new');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('skill-broken');
    });
  });
});
