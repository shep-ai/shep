/**
 * HarnessInstallerService on a real git repository (spec 150): each agent
 * family gets the files it reads, a later install replaces an earlier one, an
 * empty harness writes nothing, and no installed file can be committed.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createTempGitRepo,
  isolateGitEnv,
  type TempGitRepo,
} from '../../../helpers/harness/temp-git-repo.js';
import { HarnessInstallerService } from '@/infrastructure/services/harness-learning/harness-installer.service.js';
import { componentsFromTree } from '@/domain/harness-learning/harness-tree.js';
import {
  AgentType,
  HarnessOrigin,
  LearnedHarnessStatus,
  MemoryScope,
  type LearnedHarnessVersion,
} from '@/domain/generated/output.js';

const exec = promisify(execFile);

function version(tree: Record<string, string>, id = 'v1'): LearnedHarnessVersion {
  return {
    id,
    scope: MemoryScope.Project,
    repositoryPath: '/repo',
    status: LearnedHarnessStatus.Adopted,
    origin: HarnessOrigin.Manual,
    components: componentsFromTree(tree, (c) => `h${c.length}`),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

const TREE = {
  'instructions.md': 'When adding a table, load the `db-migration` skill.',
  'skills/db-migration/SKILL.md':
    '---\nname: db-migration\ndescription: Write a migration\n---\nRun bash scripts/verify.sh',
  'scripts/verify.sh': 'echo ok',
  'hooks/hooks.json': JSON.stringify({
    hooks: {
      PostToolUse: [
        { matcher: 'Write', hooks: [{ type: 'command', command: 'bash scripts/verify.sh' }] },
      ],
    },
  }),
};

describe('HarnessInstallerService', () => {
  let repo: TempGitRepo;
  let restoreEnv: () => void;
  let installer: HarnessInstallerService;

  beforeEach(() => {
    restoreEnv = isolateGitEnv();
    repo = createTempGitRepo({ 'README.md': '# app\n' });
    installer = new HarnessInstallerService((file, args, options) =>
      exec(file, args, options as object).then((r) => ({
        stdout: String(r.stdout),
        stderr: String(r.stderr),
      }))
    );
  });

  afterEach(() => {
    repo.cleanup();
    restoreEnv();
  });

  it('installs nothing and changes nothing for an absent or empty version', async () => {
    for (const v of [null, version({})]) {
      const result = await installer.install({
        version: v,
        agentType: AgentType.ClaudeCode,
        worktreePath: repo.root,
      });
      expect(result.writtenPaths).toEqual([]);
      expect(result.systemPrompt).toBeUndefined();
      expect(result.promptSection).toBeUndefined();
    }
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('installs Claude Code files, a hooks settings file and system-prompt text', async () => {
    const result = await installer.install({
      version: version(TREE),
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    expect(result.versionId).toBe('v1');
    expect(existsSync(join(repo.root, '.claude/skills/shep-learned-db-migration/SKILL.md'))).toBe(
      true
    );
    expect(readFileSync(join(repo.root, '.shep/learned/scripts/verify.sh'), 'utf8')).toBe(
      'echo ok'
    );
    expect(result.settingsPath).toBe(join(repo.root, '.shep/learned/settings.json'));
    expect(JSON.parse(readFileSync(result.settingsPath!, 'utf8')).hooks.PostToolUse).toHaveLength(
      1
    );
    expect(result.systemPrompt).toContain('`shep-learned-db-migration` skill');
  });

  it('puts always-on text in the prompt for agents without a system prompt', async () => {
    const result = await installer.install({
      version: version(TREE),
      agentType: AgentType.GeminiCli,
      worktreePath: repo.root,
    });
    expect(result.systemPrompt).toBeUndefined();
    expect(result.promptSection).toContain('`db-migration`');
    expect(existsSync(join(repo.root, '.shep/learned/skills/db-migration/SKILL.md'))).toBe(true);
    expect(result.warnings.some((w) => /hooks/.test(w))).toBe(true);
  });

  it('removes what a previous install wrote', async () => {
    await installer.install({
      version: version(TREE),
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    await installer.install({
      version: version({ 'guardrails.md': 'Be brief.' }, 'v2'),
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    expect(existsSync(join(repo.root, '.claude/skills/shep-learned-db-migration'))).toBe(false);
    expect(existsSync(join(repo.root, '.shep/learned/scripts/verify.sh'))).toBe(false);
    await installer.install({
      version: null,
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('never lets an installed file into a commit, even with git add -A', async () => {
    await installer.install({
      version: version(TREE),
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    repo.write('src/app.ts', 'export {};\n');
    repo.git('add', '-A');
    const staged = repo.git('diff', '--cached', '--name-only').trim().split('\n');
    expect(staged).toEqual(['src/app.ts']);
  });

  it('leaves a repository’s own skills alone', async () => {
    repo.write('.claude/skills/db-migration/SKILL.md', 'mine');
    repo.commitAll('own skill');
    await installer.install({
      version: version(TREE),
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    await installer.install({
      version: null,
      agentType: AgentType.ClaudeCode,
      worktreePath: repo.root,
    });
    expect(readFileSync(join(repo.root, '.claude/skills/db-migration/SKILL.md'), 'utf8')).toBe(
      'mine'
    );
    expect(repo.git('status', '--porcelain')).toBe('');
  });
});
