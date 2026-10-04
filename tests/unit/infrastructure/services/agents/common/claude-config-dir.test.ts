import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { claudeConfigDir } from '@/infrastructure/services/agents/common/claude-config-dir.js';

describe('claudeConfigDir', () => {
  it('defaults to ~/.claude', () => {
    expect(claudeConfigDir({})).toBe(join(homedir(), '.claude'));
  });

  it('follows CLAUDE_CONFIG_DIR, as Claude Code does (a space can set it, spec 121)', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/home/me/.claude-acme' })).toBe(
      '/home/me/.claude-acme'
    );
  });

  it('ignores a blank CLAUDE_CONFIG_DIR', () => {
    expect(claudeConfigDir({ CLAUDE_CONFIG_DIR: '  ' })).toBe(join(homedir(), '.claude'));
  });
});
