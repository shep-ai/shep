import { describe, it, expect } from 'vitest';
import {
  INSTALL_EXCLUDE_PATTERNS,
  planHarnessInstall,
} from '@/domain/harness-learning/harness-install-plan.js';
import type { HarnessTree } from '@/domain/harness-learning/harness-tree.js';
import { HarnessSurfaceFamily } from '@/domain/generated/output.js';

const TREE: HarnessTree = {
  'instructions.md': 'When adding a table, load the `db-migration` skill.',
  'guardrails.md': 'Never edit generated files.',
  'memory.md': '- uses umzug',
  'skills/db-migration/SKILL.md':
    '---\nname: db-migration\ndescription: Write an idempotent migration\n---\nRun python3 skills/db-migration/scripts/check.py then bash scripts/verify.sh',
  'skills/db-migration/scripts/check.py': 'print(1)',
  'scripts/verify.sh': 'echo ok',
  'subagents/log-reader/AGENT.md':
    '---\nname: log-reader\ndescription: Summarise a CI log\n---\nRead the log.',
  'hooks/hooks.json': JSON.stringify({
    hooks: {
      PostToolUse: [
        { matcher: 'Write', hooks: [{ type: 'command', command: 'bash scripts/verify.sh' }] },
      ],
    },
  }),
};

describe('planHarnessInstall', () => {
  it('installs nothing for an empty tree', () => {
    const plan = planHarnessInstall({}, HarnessSurfaceFamily.ClaudeCode);
    expect(plan.files).toEqual({});
    expect(plan.systemPrompt).toBeUndefined();
    expect(plan.promptSection).toBeUndefined();
    expect(plan.hooksSettings).toBeUndefined();
  });

  describe('Claude Code', () => {
    const plan = planHarnessInstall(TREE, HarnessSurfaceFamily.ClaudeCode);

    it('puts prefixed skills and subagents where Claude Code discovers them', () => {
      expect(Object.keys(plan.files).sort()).toEqual([
        '.claude/agents/shep-learned-log-reader.md',
        '.claude/skills/shep-learned-db-migration/SKILL.md',
        '.claude/skills/shep-learned-db-migration/scripts/check.py',
        '.shep/learned/scripts/verify.sh',
      ]);
      expect(plan.files['.claude/skills/shep-learned-db-migration/SKILL.md']).toContain(
        'name: shep-learned-db-migration'
      );
      expect(plan.files['.claude/agents/shep-learned-log-reader.md']).toContain(
        'name: shep-learned-log-reader'
      );
    });

    it('rewrites script paths and skill names to their installed locations', () => {
      const skill = plan.files['.claude/skills/shep-learned-db-migration/SKILL.md'];
      expect(skill).toContain('python3 .claude/skills/shep-learned-db-migration/scripts/check.py');
      expect(skill).toContain('bash .shep/learned/scripts/verify.sh');
      expect(plan.systemPrompt).toContain('`shep-learned-db-migration` skill');
      expect(plan.systemPrompt).toContain('Never edit generated files.');
      expect(plan.promptSection).toBeUndefined();
    });

    it('turns hooks into a settings file with rewritten commands', () => {
      const settings = JSON.parse(plan.hooksSettings!);
      expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe(
        'bash .shep/learned/scripts/verify.sh'
      );
    });

    it('never installs memory as a file', () => {
      expect(Object.values(plan.files).join('\n')).not.toContain('uses umzug');
      expect(plan.systemPrompt).not.toContain('uses umzug');
    });
  });

  describe('Codex', () => {
    const plan = planHarnessInstall(TREE, HarnessSurfaceFamily.Codex);

    it('uses .agents/skills and puts always-on text and subagents in the prompt', () => {
      expect(plan.files['.agents/skills/shep-learned-db-migration/SKILL.md']).toBeDefined();
      expect(plan.files['.shep/learned/subagents/log-reader/AGENT.md']).toBeDefined();
      expect(plan.systemPrompt).toBeUndefined();
      expect(plan.promptSection).toContain('Never edit generated files.');
      expect(plan.promptSection).toContain('.shep/learned/subagents/log-reader/AGENT.md');
      expect(plan.hooksSettings).toBeUndefined();
      expect(plan.warnings.some((w) => /hooks/.test(w))).toBe(true);
    });
  });

  describe('prompt-section agents', () => {
    const plan = planHarnessInstall(TREE, HarnessSurfaceFamily.PromptSection);

    it('writes skills under .shep/learned and indexes them in the prompt', () => {
      expect(plan.files['.shep/learned/skills/db-migration/SKILL.md']).toContain(
        'python3 .shep/learned/skills/db-migration/scripts/check.py'
      );
      expect(plan.promptSection).toContain('`db-migration`');
      expect(plan.promptSection).toContain('Write an idempotent migration');
      expect(plan.promptSection).toContain('.shep/learned/skills/db-migration/SKILL.md');
    });
  });

  it('excludes every installed path from git', () => {
    expect(INSTALL_EXCLUDE_PATTERNS).toEqual([
      '/.shep/learned/',
      '/.claude/skills/shep-learned-*/',
      '/.claude/agents/shep-learned-*.md',
      '/.agents/skills/shep-learned-*/',
    ]);
  });
});
